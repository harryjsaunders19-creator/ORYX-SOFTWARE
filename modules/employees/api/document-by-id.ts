import fs from "fs"
import { apiInternalError } from "@/shared/api-errors"

import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import {
  employeeService,
  resolveEmployeeFilePath,
  canManageDocuments,
  canUploadRestrictedDocuments,
  canViewDocuments,
} from "@/modules/employees"
import { employeeDocumentDb } from "@/lib/db/stores"

type Ctx = { params: Promise<{ id: string; docId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const doc = employeeDocumentDb.findUnique(docId)
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

    const fullPath = resolveEmployeeFilePath(doc.filePath)
    if (!fullPath || !fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File missing on server" }, { status: 404 })
    }

    const buf = fs.readFileSync(fullPath)
    return new NextResponse(buf, {
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
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const doc = employeeDocumentDb.findUnique(docId)
    if (!doc || doc.userId !== id) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }
    const access = await employeeService.getAccess(auth.user, id)
    if (!canManageDocuments(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const fullPath = resolveEmployeeFilePath(doc.filePath)
    if (fullPath && fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    employeeDocumentDb.delete(docId)
    await employeeService.logActivity(id, "DOCUMENT_DELETED", doc.name, auth.user)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("employees.api.document-by-id", err)
  }
}
