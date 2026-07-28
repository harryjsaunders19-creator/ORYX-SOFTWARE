/**
 * Resolve the document family context for /api/jobs/[id]/documents.
 * Supports classic jobs (original or revision) and parent_jobs when work-items model is on.
 */
import { jobService } from "@/modules/jobs"
import { parentJobService } from "@/modules/jobs/services/parent-work-item-service"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"
import { revisionParentId } from "@/lib/revision-chain"

export interface DocumentFamilyContext {
  rootJobId: string
  /** Classic job id to attach to (original or specific revision). */
  defaultJobId: string | null
  parentJobId: string | null
  mode: "classic" | "parent"
  currentRevisionJobId: string | null
  currentWorkItemId: string | null
  currentRevisionLetter: string | null
  timelineJobId: string
  /** All root ids that may hold documents for this family (parent + legacy). */
  documentRootIds: string[]
}

function uniqueIds(...ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

export function documentBelongsToFamily(
  doc: { rootJobId: string; parentJobId?: string | null; jobId?: string | null },
  family: DocumentFamilyContext,
): boolean {
  if (family.documentRootIds.includes(doc.rootJobId)) return true
  if (family.parentJobId && doc.parentJobId === family.parentJobId) return true
  if (family.defaultJobId && (doc.jobId === family.defaultJobId || doc.rootJobId === family.defaultJobId)) return true
  if (family.currentRevisionJobId && doc.jobId === family.currentRevisionJobId) return true
  return false
}

export async function resolveDocumentFamily(id: string): Promise<DocumentFamilyContext | null> {
  if (isWorkItemsModelEnabled()) {
    try {
      const dash = await parentJobService.getDashboard(id)
      if (dash?.parent) {
        const current = dash.currentActive
        const rootJobId = dash.parent.id
        const defaultJobId = dash.parent.legacyJobId || null
        return {
          rootJobId,
          defaultJobId,
          parentJobId: dash.parent.id,
          mode: "parent",
          currentRevisionJobId: null,
          currentWorkItemId: current?.id ?? null,
          currentRevisionLetter: current?.revisionLetter ?? null,
          timelineJobId: dash.parent.legacyJobId || dash.parent.id,
          documentRootIds: uniqueIds(rootJobId, defaultJobId),
        }
      }
    } catch { /* fall through to classic */ }

    try {
      const { supabaseWorkItemRepo } = await import("@/modules/jobs/supabase/work-item-repository")
      const wi = await supabaseWorkItemRepo.findUnique(id)
      if (wi) {
        const dash = await parentJobService.getDashboard(wi.parentJobId)
        if (dash?.parent) {
          const rootJobId = dash.parent.id
          const defaultJobId = dash.parent.legacyJobId || null
          return {
            rootJobId,
            defaultJobId,
            parentJobId: dash.parent.id,
            mode: "parent",
            currentRevisionJobId: null,
            currentWorkItemId: wi.id,
            currentRevisionLetter: wi.revisionLetter,
            timelineJobId: wi.legacyJobId || dash.parent.legacyJobId || dash.parent.id,
            documentRootIds: uniqueIds(rootJobId, defaultJobId, wi.legacyJobId),
          }
        }
      }
    } catch { /* fall through */ }
  }

  const job = await jobService.findUnique(id)
  if (!job) return null

  const rootId = revisionParentId(job)
  const root = rootId === job.id ? job : await jobService.findUnique(rootId)
  const familyRoot = root ?? job

  // Prefer attaching to the latest revision when viewing the master page
  let currentRevisionJobId: string | null = null
  let currentRevisionLetter: string | null = null
  if (!job.parentJobId) {
    const revs = await jobService.revisionsForJob(job.id)
    const latest = revs.length ? revs[revs.length - 1] : null
    currentRevisionJobId = latest?.id ?? job.id
    currentRevisionLetter = latest?.revisionLetter ?? null
  } else {
    currentRevisionJobId = job.id
    currentRevisionLetter = job.revisionLetter
  }

  return {
    rootJobId: familyRoot.id,
    defaultJobId: familyRoot.id,
    parentJobId: null,
    mode: "classic",
    currentRevisionJobId,
    currentRevisionLetter,
    currentWorkItemId: null,
    timelineJobId: currentRevisionJobId || familyRoot.id,
    documentRootIds: uniqueIds(familyRoot.id, currentRevisionJobId, job.id),
  }
}
