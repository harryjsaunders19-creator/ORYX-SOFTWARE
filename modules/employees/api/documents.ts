import fs from "fs"
import path from "path"
import { NextRequest, NextResponse } from "next/server"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import { employeeDocumentDb } from "@/lib/db/stores"
import {
  employeeUserDir,
  safeEmployeeFilename,
  DOC_MIME,
  MAX_DOC_BYTES,
} from "@/modules/employees"
import { canManageDocuments, canUploadRestrictedDocuments } from "@/modules/employees"
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/modules/employees"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    const includeRestricted = canUploadRestrictedDocuments(access)
    const documents = employeeDocumentDb.findByUser(id, includeRestricted)
    return NextResponse.json({ documents })
  } catch (err) {
    console.error("[GET /api/employees/[id]/documents]", err)
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
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
    const filename = `${createId()}${ext}`
    const dir = employeeUserDir(id)
    const fullPath = path.join(dir, safeEmployeeFilename(filename))
    fs.writeFileSync(fullPath, Buffer.from(await file.arrayBuffer()))
    const relPath = path.join(".data", "employee-files", id, safeEmployeeFilename(filename)).replace(/\\/g, "/")

    const doc = employeeDocumentDb.create({
      id: createId(),
      userId: id,
      name,
      category,
      filePath: relPath,
      mimeType: file.type,
      fileSize: file.size,
      restricted: restricted ? 1 : 0,
      uploadedBy: auth.user.id,
      uploadedByName: auth.user.name,
    })

    await employeeService.logActivity(id, "DOCUMENT_UPLOADED", name, auth.user)
    return NextResponse.json({ document: doc }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/employees/[id]/documents]", err)
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 })
  }
}
