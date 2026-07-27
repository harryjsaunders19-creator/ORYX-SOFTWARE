import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { jobDocumentService } from "@/modules/job-documents/services/document-service"
import { resolveDocumentFamily } from "@/modules/job-documents/services/resolve-family"
import { IMAGE_MIME, PDF_MIME } from "@/modules/job-documents/constants"

type Ctx = { params: Promise<{ id: string; docId: string }> }

async function loadBytes(jobRouteId: string, docId: string) {
  const family = await resolveDocumentFamily(jobRouteId)
  if (!family) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) }
  const packed = await jobDocumentService.download(docId)
  if (!packed || packed.row.rootJobId !== family.rootJobId || packed.row.deletedAt) {
    return { error: NextResponse.json({ error: "Document not found" }, { status: 404 }) }
  }
  return { packed }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const loaded = await loadBytes(id, docId)
    if ("error" in loaded && loaded.error) return loaded.error

    const { row, buffer } = loaded.packed!
    const disposition = req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment"
    const filename = row.filename.replace(/"/g, "")

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": row.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch (err) {
    return apiInternalError("job-documents.download", err)
  }
}

/** Preview = inline for images/PDFs only. */
export async function preview(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const loaded = await loadBytes(id, docId)
    if ("error" in loaded && loaded.error) return loaded.error

    const { row, buffer } = loaded.packed!
    const canInline = IMAGE_MIME.has(row.mimeType) || PDF_MIME.has(row.mimeType)
    if (!canInline) {
      return NextResponse.json({ error: "Preview not available for this file type" }, { status: 415 })
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=120",
      },
    })
  } catch (err) {
    return apiInternalError("job-documents.preview", err)
  }
}
