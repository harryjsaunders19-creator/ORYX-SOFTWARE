import { apiInternalError } from "@/shared/api-errors"
import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import {
  employeeService,
  readEmployeeFile,
  deleteEmployeeFile,
  canManageDocuments,
  canUploadRestrictedDocuments,
  canViewDocuments,
  type EmployeeDocumentRow,
} from "@/modules/employees"
import { employeeDocumentDb } from "@/lib/db/stores"
import { useSupabaseEmployees as employeesUseSupabase } from "@/shared/supabase/feature-flags"
import { supabaseEmployeeRepo } from "@/modules/employees/supabase/repository"
import { experimentalDisabledResponse } from "@/shared/experimental/experimental-features"

type Ctx = { params: Promise<{ id: string; docId: string }> }

async function loadDocument(docId: string): Promise<EmployeeDocumentRow | null> {
  if (employeesUseSupabase()) return supabaseEmployeeRepo.findDocument(docId)
  return employeeDocumentDb.findUnique(docId)
}

async function removeDocument(docId: string): Promise<void> {
  if (employeesUseSupabase()) {
    await supabaseEmployeeRepo.deleteDocument(docId)
    return
  }
  employeeDocumentDb.delete(docId)
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const doc = await loadDocument(docId)
    if (!doc || doc.userId !== id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }
    const access = await employeeService.getAccess(auth.user, id)
    if (!canViewDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (doc.restricted && !canUploadRestrictedDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const buf = await readEmployeeFile(doc.filePath)
    if (!buf) {
      return NextResponse.json({ error: "File missing on server" }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `attachment; filename="${doc.name.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    return apiInternalError("employees.api.document-by-id", err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const doc = await loadDocument(docId)
    if (!doc || doc.userId !== id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }
    const access = await employeeService.getAccess(auth.user, id)
    if (!canManageDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await deleteEmployeeFile(doc.filePath)
    await removeDocument(docId)
    await employeeService.logActivity(id, "DOCUMENT_DELETED", doc.name, auth.user)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("employees.api.document-by-id", err)
  }
}
