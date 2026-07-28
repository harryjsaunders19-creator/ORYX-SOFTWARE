import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"
import { listResponse } from "@/shared/utils/api-cache"
import { jobDocumentService } from "@/modules/job-documents/services/document-service"
import { resolveDocumentFamily } from "@/modules/job-documents/services/resolve-family"
import {
  JOB_DOC_LIST_PAGE_SIZE,
  isValidDocumentCategory,
  type DocumentKindFilter,
  type DocumentPeriodFilter,
  type DocumentScopeFilter,
} from "@/modules/job-documents/constants"

type Ctx = { params: Promise<{ id: string }> }

const KIND_VALUES = new Set(["images", "pdfs", "emails", "drawings", "calculations", "other"])
const SCOPE_VALUES = new Set(["all", "current", "previous"])
const PERIOD_VALUES = new Set(["all", "today", "week", "month"])

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await ctx.params
    const family = await resolveDocumentFamily(id)
    if (!family) return NextResponse.json({ error: "Job not found" }, { status: 404 })

    const sp = req.nextUrl.searchParams
    const q = sp.get("q") ?? undefined
    const category = sp.get("category") ?? undefined
    const kindRaw = sp.get("kind") ?? ""
    const scopeRaw = sp.get("scope") ?? "all"
    const periodRaw = sp.get("period") ?? "all"
    const kind = KIND_VALUES.has(kindRaw) ? kindRaw as DocumentKindFilter : undefined
    const scope = SCOPE_VALUES.has(scopeRaw) ? scopeRaw as DocumentScopeFilter : "all"
    const period = PERIOD_VALUES.has(periodRaw) ? periodRaw as DocumentPeriodFilter : "all"
    const page = parsePageParam(sp.get("page"))
    const limit = parseLimitParam(sp.get("limit"), JOB_DOC_LIST_PAGE_SIZE, 100)

    const result = await jobDocumentService.list({
      rootJobId: family.rootJobId,
      rootJobIds: family.documentRootIds,
      parentJobId: family.parentJobId,
      q,
      category: category && isValidDocumentCategory(category) ? category : category || undefined,
      kind,
      scope,
      period,
      currentJobId: family.currentRevisionJobId,
      currentWorkItemId: family.currentWorkItemId,
      revisionJobId: sp.get("revisionJobId"),
      workItemId: sp.get("workItemId"),
      page,
      limit,
    })

    return listResponse({
      ...result,
      family: {
        rootJobId: family.rootJobId,
        mode: family.mode,
        currentRevisionJobId: family.currentRevisionJobId,
        currentWorkItemId: family.currentWorkItemId,
        currentRevisionLetter: family.currentRevisionLetter,
      },
    })
  } catch (err) {
    return apiInternalError("job-documents.list", err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await ctx.params
    const family = await resolveDocumentFamily(id)
    if (!family) return NextResponse.json({ error: "Job not found" }, { status: 404 })

    const form = await req.formData()
    const category = typeof form.get("category") === "string" ? String(form.get("category")) : "General"
    const description = typeof form.get("description") === "string" ? String(form.get("description")) : null
    const attachToRevision = form.get("attachToRevision") === "true" || form.get("attachToRevision") === "1"
    const revisionJobId = typeof form.get("revisionJobId") === "string" ? String(form.get("revisionJobId")) : null
    const workItemId = typeof form.get("workItemId") === "string" ? String(form.get("workItemId")) : null

    const files: Array<{ name: string; type: string; size: number; buffer: Buffer }> = []
    for (const [key, value] of form.entries()) {
      if ((key === "file" || key === "files" || key.startsWith("file")) && value instanceof File) {
        const buffer = Buffer.from(await value.arrayBuffer())
        files.push({
          name: value.name,
          type: value.type,
          size: value.size,
          buffer,
        })
      }
    }
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 422 })
    }

    let jobId = family.defaultJobId
    let parentJobId = family.parentJobId
    let revisionLetter: string | null = null
    let scopedWorkItemId: string | null = null

    if (family.mode === "parent") {
      parentJobId = family.parentJobId
      if (attachToRevision || workItemId) {
        scopedWorkItemId = workItemId || family.currentWorkItemId
        revisionLetter = family.currentRevisionLetter
      }
      jobId = family.defaultJobId
    } else {
      if (attachToRevision || revisionJobId) {
        jobId = revisionJobId || family.currentRevisionJobId || family.defaultJobId
        revisionLetter = family.currentRevisionLetter
        // If attaching to current which is still original, leave letter null
        if (jobId === family.rootJobId) revisionLetter = null
      } else {
        jobId = family.rootJobId
        revisionLetter = null
      }
    }

    const actor = actorName(auth.user)
    const { documents, errors } = await jobDocumentService.uploadMany({
      rootJobId: family.rootJobId,
      jobId,
      parentJobId,
      workItemId: scopedWorkItemId,
      revisionLetter,
      category,
      description,
      files,
      uploadedBy: auth.user.id,
      uploadedByName: actor,
      timelineJobId: family.timelineJobId,
    })

    if (!documents.length && errors.length) {
      return NextResponse.json({ error: errors[0].error, errors }, { status: 422 })
    }

    return NextResponse.json({ documents, errors }, { status: 201 })
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err
      ? Number((err as { status: number }).status) || 500
      : 500
    if (status === 422) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid upload" }, { status: 422 })
    }
    return apiInternalError("job-documents.upload", err)
  }
}
