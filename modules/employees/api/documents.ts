import { apiInternalError } from "@/shared/api-errors"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import { employeeDocumentDb } from "@/lib/db/stores"
import {
  safeEmployeeFilename,
  writeEmployeeFile,
  DOC_MIME,
  MAX_DOC_BYTES,
  canManageDocuments,
  canUploadRestrictedDocuments,
  canViewDocuments,
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type EmployeeDocumentRow,
} from "@/modules/employees"
import { useSupabaseEmployees as employeesUseSupabase } from "@/shared/supabase/feature-flags"
import { supabaseEmployeeRepo } from "@/modules/employees/supabase/repository"
import { nowIso } from "@/lib/db/helpers"
import { experimentalDisabledResponse } from "@/shared/experimental/experimental-features"

type Ctx = { params: Promise<{ id: string }> }

async function listDocuments(userId: string, includeRestricted: boolean): Promise<EmployeeDocumentRow[]> {
  if (employeesUseSupabase()) {
    return supabaseEmployeeRepo.findDocumentsByUser(userId, includeRestricted)
  }
  return employeeDocumentDb.findByUser(userId, includeRestricted)
}

async function createDocument(row: EmployeeDocumentRow): Promise<EmployeeDocumentRow> {
  if (employeesUseSupabase()) {
    await supabaseEmployeeRepo.upsertDocument(row)
    return row
  }
  return employeeDocumentDb.create({
    id: row.id,
    userId: row.userId,
    name: row.name,
    category: row.category,
    filePath: row.filePath,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    restricted: row.restricted,
    uploadedBy: row.uploadedBy,
    uploadedByName: row.uploadedByName,
  })
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canViewDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const includeRestricted = canUploadRestrictedDocuments(access)
    const documents = await listDocuments(id, includeRestricted)
    return NextResponse.json({ documents })
  } catch (err) {
    return apiInternalError("employees.api.documents", err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canManageDocuments(access) && auth.user.id !== id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const form = await req.formData()
    const file = form.get("file")
    const name = String(form.get("name") ?? "").trim()
    const category = String(form.get("category") ?? "OTHER") as DocumentCategory
    const restricted = form.get("restricted") === "1" || form.get("restricted") === "true"

    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    if (!name) return NextResponse.json({ error: "Document name is required" }, { status: 422 })
    if (!DOCUMENT_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 422 })
    }
    if (restricted && !canUploadRestrictedDocuments(access)) {
      return NextResponse.json({ error: "Cannot upload restricted documents" }, { status: 403 })
    }
    if (!DOC_MIME.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 422 })
    }
    if (file.size > MAX_DOC_BYTES) {
      return NextResponse.json({ error: "File must be under 15 MB" }, { status: 422 })
    }

    const ext = path.extname(file.name) || ".bin"
    const filename = safeEmployeeFilename(`${createId()}${ext}`)
    const storedPath = await writeEmployeeFile({
      userId: id,
      filename,
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    })

    const docRow = {
      id: createId(),
      userId: id,
      name,
      category,
      filePath: storedPath,
      mimeType: file.type,
      fileSize: file.size,
      restricted: restricted ? 1 : 0,
      uploadedBy: auth.user.id,
      uploadedByName: auth.user.name,
    }
    const now = nowIso()
    const doc = await createDocument({
      ...docRow,
      createdAt: now,
      updatedAt: now,
    })

    await employeeService.logActivity(id, "DOCUMENT_UPLOADED", name, auth.user)
    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (err) {
    return apiInternalError("employees.api.documents", err)
  }
}
