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
} from "@/modules/employees"
import { experimentalDisabledResponse } from "@/shared/experimental/experimental-features"

type Ctx = { params: Promise<{ id: string; docId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const disabled = experimentalDisabledResponse("employees")
    if (disabled) return disabled

    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const doc = await employeeService.findDocument(docId)
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
    const doc = await employeeService.findDocument(docId)
    if (!doc || doc.userId !== id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }
    const access = await employeeService.getAccess(auth.user, id)
    if (!canManageDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await deleteEmployeeFile(doc.filePath)
    await employeeService.deleteDocument(docId)
    await employeeService.logActivity(id, "DOCUMENT_DELETED", doc.name, auth.user)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("employees.api.document-by-id", err)
  }
}
