/**
 * Jobs Inspector bootstrap — one request for the classic inspector panel.
 *
 * Returns the minimum payload needed for first paint:
 * - selected job (+ parent / current revision meta when applicable)
 * - full revision family chain
 * - lightweight document metadata (no blobs)
 * - lightweight quote summaries for the family
 *
 * Heavy document content / filtered document browsing stays on
 * GET /api/jobs/:id/documents. Full quote editing stays on /api/quotes.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { resourceResponse } from "@/shared/utils/api-cache"
import { apiInternalError } from "@/shared/api-errors"
import { jobService } from "../services/job-service"
import { revisionFamilyService } from "../services/revision-family-service"
import { cancelRecordForJob } from "@/modules/archive/cancel-record"
import { resolveDocumentFamily } from "@/modules/job-documents/services/resolve-family"
import { jobDocumentService } from "@/modules/job-documents/services/document-service"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const payload = job.archivedAt
      ? { ...job, cancelRecord: await cancelRecordForJob(id) }
      : job

    const familyPromise = revisionFamilyService.getForJob(id)
    const parentPromise = job.parentJobId
      ? jobService.findUnique(job.parentJobId)
      : Promise.resolve(null)
    const currentMetaPromise = !job.parentJobId
      ? Promise.all([
          jobService.findLatestRevisionForParent(job.id),
          jobService.countRevisionsForParent(job.id),
        ])
      : Promise.resolve(null)

    const [family, parentJob, revisionMeta, enrichedList] = await Promise.all([
      familyPromise,
      parentPromise,
      currentMetaPromise,
      import("./enrich-linked-quotes").then(m => m.enrichJobsWithLinkedQuotes([payload])),
    ])

    if (!family) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const enrichedJob = enrichedList[0] ?? payload
    const jobOut: Record<string, unknown> = { ...enrichedJob }
    if (parentJob) jobOut.parentJob = parentJob
    if (revisionMeta) {
      const [latest, revisionCount] = revisionMeta
      jobOut.currentRevision = latest
      jobOut.currentRevisionId = latest?.id ?? job.id
      jobOut.currentRevisionLetter = latest?.revisionLetter ?? null
      jobOut.hasRevisions = revisionCount > 0
      jobOut.revisionCount = revisionCount
    }

    const familyJobIds = [
      family.parentId,
      ...family.revisions.map(r => r.id),
    ].filter(Boolean)

    const [quotes, documents] = await Promise.all([
      loadQuoteSummaries(familyJobIds),
      loadDocumentSummaries(id),
    ])

    return resourceResponse({
      /** Echo for client stale-bleed guards when switching selection rapidly. */
      jobId: id,
      parentId: family.parentId,
      job: jobOut,
      revisions: {
        parentId: family.parentId,
        baseDrawingNumber: family.baseDrawingNumber,
        original: family.original,
        revisions: family.revisions,
        chain: family.chain,
        canAddRevision: family.canAddRevision,
        nextRevisionLetter: family.nextRevisionLetter,
      },
      documents: { documents },
      quotes: { quotes },
    })
  } catch (err) {
    return apiInternalError("jobs.inspector.get", err)
  }
}

async function loadQuoteSummaries(jobIds: string[]) {
  if (!jobIds.length) return []
  const { quoteService } = await import("@/modules/quotes")
  const rows = await quoteService.findByJobIds(jobIds)
  return rows.map(q => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    quoteValue: q.quoteValue,
    status: q.status,
    jobId: q.jobId,
    updatedAt: q.updatedAt,
  }))
}

async function loadDocumentSummaries(jobId: string) {
  const family = await resolveDocumentFamily(jobId)
  if (!family) return []
  const result = await jobDocumentService.list({
    rootJobId: family.rootJobId,
    rootJobIds: family.documentRootIds,
    parentJobId: family.parentJobId,
    scope: "all",
    period: "all",
    currentJobId: family.currentRevisionJobId,
    currentWorkItemId: family.currentWorkItemId,
    page: 1,
    limit: 40,
  })
  return (result.documents ?? []).map(d => ({
    id: d.id,
    filename: d.filename,
    originalFilename: d.originalFilename ?? null,
    createdAt: d.createdAt,
    revisionLetter: d.revisionLetter ?? null,
  }))
}
