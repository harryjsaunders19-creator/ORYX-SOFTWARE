import { NextRequest, NextResponse } from "next/server"
import { requireSignIn, requireRole, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { resourceResponse } from "@/shared/utils/api-cache"
import { jobDocumentService } from "@/modules/job-documents/services/document-service"
import { resolveDocumentFamily } from "@/modules/job-documents/services/resolve-family"
import { isValidDocumentCategory } from "@/modules/job-documents/constants"

type Ctx = { params: Promise<{ id: string; docId: string }> }

async function loadOwnedDoc(jobRouteId: string, docId: string) {
  const family = await resolveDocumentFamily(jobRouteId)
  if (!family) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) }
  const doc = await jobDocumentService.findUnique(docId)
  if (!doc || doc.deletedAt || doc.rootJobId !== family.rootJobId) {
    return { error: NextResponse.json({ error: "Document not found" }, { status: 404 }) }
  }
  return { family, doc }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const loaded = await loadOwnedDoc(id, docId)
    if ("error" in loaded && loaded.error) return loaded.error
    return resourceResponse(loaded.doc!)
  } catch (err) {
    return apiInternalError("job-documents.get", err)
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireRole(["ADMIN", "ENGINEER"])
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const loaded = await loadOwnedDoc(id, docId)
    if ("error" in loaded && loaded.error) return loaded.error

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const patch: {
      filename?: string
      category?: string
      description?: string | null
      jobId?: string | null
      workItemId?: string | null
      revisionLetter?: string | null
    } = {}

    if (typeof body.filename === "string" && body.filename.trim()) {
      patch.filename = body.filename.trim().slice(0, 180)
    }
    if (typeof body.category === "string") {
      if (!isValidDocumentCategory(body.category)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 422 })
      }
      patch.category = body.category
    }
    if (body.description !== undefined) {
      patch.description = body.description === null || body.description === ""
        ? null
        : String(body.description).trim()
    }
    if (body.jobId !== undefined) patch.jobId = body.jobId ? String(body.jobId) : null
    if (body.workItemId !== undefined) patch.workItemId = body.workItemId ? String(body.workItemId) : null
    if (body.revisionLetter !== undefined) {
      patch.revisionLetter = body.revisionLetter ? String(body.revisionLetter) : null
    }

    const updated = await jobDocumentService.update(docId, patch)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err
      ? Number((err as { status: number }).status) || 500
      : 500
    if (status === 422) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid" }, { status: 422 })
    }
    return apiInternalError("job-documents.patch", err)
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireRole(["ADMIN", "ENGINEER"])
    if (auth instanceof NextResponse) return auth
    const { id, docId } = await ctx.params
    const loaded = await loadOwnedDoc(id, docId)
    if ("error" in loaded && loaded.error) return loaded.error

    const deleted = await jobDocumentService.remove(
      docId,
      actorName(auth.user),
      loaded.family!.timelineJobId,
    )
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiInternalError("job-documents.delete", err)
  }
}
