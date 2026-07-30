/**
 * Revision family — one optimised read path for the full drawing history.
 */
import type { JobRow } from "@/modules/jobs/types/job-types"
import {
  baseDrawingNumber,
  buildRevisionFamilyIndex,
  revisionParentId,
} from "@/lib/revision-chain"
import { nextRevisionLetter } from "@/lib/constants"
import { jobService } from "./job-service"
import { historyService } from "./history-service"
import type { RevisionFamilyResponse, RevisionHistoryEntry } from "../types/revision-types"

function entryTitle(
  isOriginal: boolean,
  revisionLetter: string | null,
  status: string,
  isCurrent: boolean,
): string {
  if (isOriginal) {
    const base = status === "ISSUED" ? "Original Issue" : "Original"
    return isCurrent ? `Current — ${base}` : base
  }
  const rev = `Rev ${revisionLetter ?? "?"}`
  return isCurrent ? `Current Revision — ${rev}` : rev
}

export function buildRevisionHistoryChain(opts: {
  original: JobRow
  revisions: JobRow[]
  currentJobId: string
  issuedBy: Map<string, { changedBy: string; changedAt: string }>
}): RevisionHistoryEntry[] {
  const { original, revisions, currentJobId, issuedBy } = opts
  const members: JobRow[] = [original, ...revisions]

  const entries = members.map(member => {
    const isOriginal = member.id === original.id
    const isCurrent = member.id === currentJobId
    const issued = issuedBy.get(member.id) ?? null

    return {
      id: member.id,
      drawingNumber: member.drawingNumber,
      revisionLetter: member.revisionLetter,
      isOriginal,
      isCurrent,
      title: entryTitle(isOriginal, member.revisionLetter, member.status, isCurrent),
      dateCreated: member.dateCreated,
      notes: member.notes,
      status: member.status,
      designer: member.designer || null,
      issuedBy: issued?.changedBy ?? null,
      issuedAt: issued?.changedAt ?? null,
      billable: member.billable ?? !member.parentJobId,
    }
  })

  // Current first, then reverse chronological (newest → oldest).
  return [...entries].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    const aTs = Date.parse(a.dateCreated || "")
    const bTs = Date.parse(b.dateCreated || "")
    const aSafe = Number.isFinite(aTs) ? aTs : 0
    const bSafe = Number.isFinite(bTs) ? bTs : 0
    return bSafe - aSafe
  })
}

export const revisionFamilyService = {
  /**
   * Full revision family for any job in the chain (original or revision).
   * At most 3 DB round trips: anchor, parent+children, status history bulk.
   */
  async getForJob(anchorJobId: string): Promise<RevisionFamilyResponse | null> {
    const anchor = await jobService.findUnique(anchorJobId)
    if (!anchor) return null

    const parentId = revisionParentId(anchor)
    const parentPromise = anchor.parentJobId
      ? jobService.findUnique(parentId)
      : Promise.resolve(anchor)

    const [parent, revisions] = await Promise.all([
      parentPromise,
      jobService.revisionsForJob(parentId),
    ])

    if (!parent) return null

    const allIds = [parent.id, ...revisions.map(r => r.id)]
    const issuedBy = await historyService.issuedByForJobs(allIds)

    const { latestByParent } = buildRevisionFamilyIndex(
      revisions.map(r => ({ id: r.id, parentJobId: r.parentJobId, revisionLetter: r.revisionLetter })),
    )
    const latest = latestByParent.get(parentId) ?? null
    // Project page can always create the next letter; POST targets the latest revision id.
    const canAddRevision = true
    const usedLetters = revisions.map(r => r.revisionLetter).filter(Boolean) as string[]
    const nextRevLetter = nextRevisionLetter(usedLetters)

    // "Current" = latest revision letter, or the original when none exist.
    const currentJobId = latest?.id ?? parent.id

    const chain = buildRevisionHistoryChain({
      original: parent,
      revisions,
      currentJobId,
      issuedBy,
    })

    return {
      parentId,
      baseDrawingNumber: baseDrawingNumber(parent.drawingNumber),
      original: parent,
      revisions,
      chain,
      canAddRevision,
      nextRevisionLetter: nextRevLetter,
    }
  },
}
