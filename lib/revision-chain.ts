/**
 * Revision chain rules — the next revision is always created from the
 * latest revision in the chain (or from the original when none exist yet).
 */

import { REVISION_LETTERS } from "@/lib/constants"

export interface RevisionAnchorJob {
  id: string
  parentJobId: string | null
}

export interface RevisionChainRow extends RevisionAnchorJob {
  revisionLetter?: string | null
}

export interface RevisionFamilyFields {
  canAddRevision: boolean
  hasRevisions: boolean
  revisionCount: number
  latestRevisionId: string | null
  latestRevisionLetter: string | null
  isLatestInChain: boolean
}

const LETTER_RANK = new Map(REVISION_LETTERS.map((l, i) => [l, i]))

/** Strip a trailing " Rev X" suffix from a drawing number. */
export function baseDrawingNumber(drawingNumber: string): string {
  return drawingNumber.replace(/ Rev [A-Z]$/, "")
}

export function compareRevisionLetters(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const ra = LETTER_RANK.get((a ?? "").toUpperCase()) ?? -1
  const rb = LETTER_RANK.get((b ?? "").toUpperCase()) ?? -1
  return ra - rb
}

/** Original (parent) job id for any job in a revision chain. */
export function revisionParentId(job: RevisionAnchorJob): string {
  return job.parentJobId ?? job.id
}

/** True when this row is where the user should click "Add revision". */
export function canAddRevisionFrom(
  job: RevisionAnchorJob,
  latestByParent: Map<string, RevisionAnchorJob>,
): boolean {
  const parentId = revisionParentId(job)
  const latest = latestByParent.get(parentId)
  if (!latest) {
    return job.parentJobId === null
  }
  return job.id === latest.id
}

export function collectRevisionParentIds(jobs: RevisionAnchorJob[]): string[] {
  const ids = new Set<string>()
  for (const j of jobs) {
    ids.add(revisionParentId(j))
  }
  return [...ids]
}

export function buildLatestRevisionMap(
  latestRevisions: RevisionAnchorJob[],
): Map<string, RevisionAnchorJob> {
  const map = new Map<string, RevisionAnchorJob>()
  for (const rev of latestRevisions) {
    if (rev.parentJobId) map.set(rev.parentJobId, rev)
  }
  return map
}

/** Count revisions and pick the latest letter per original job. */
export function buildRevisionFamilyIndex(rows: RevisionChainRow[]): {
  countByParent: Map<string, number>
  latestByParent: Map<string, RevisionChainRow>
} {
  const countByParent = new Map<string, number>()
  const latestByParent = new Map<string, RevisionChainRow>()
  for (const row of rows) {
    if (!row.parentJobId) continue
    const parentId = row.parentJobId
    countByParent.set(parentId, (countByParent.get(parentId) ?? 0) + 1)
    const current = latestByParent.get(parentId)
    if (!current || compareRevisionLetters(row.revisionLetter, current.revisionLetter) > 0) {
      latestByParent.set(parentId, row)
    }
  }
  return { countByParent, latestByParent }
}

export function enrichRevisionFamily<T extends RevisionAnchorJob & { revisionLetter?: string | null }>(
  pageJobs: T[],
  revisionRows: RevisionChainRow[],
): (T & RevisionFamilyFields)[] {
  const { countByParent, latestByParent } = buildRevisionFamilyIndex(revisionRows)
  const latestMap = latestByParent as Map<string, RevisionAnchorJob>

  return pageJobs.map(job => {
    const parentId = revisionParentId(job)
    const revisionCount = countByParent.get(parentId) ?? 0
    const latest = latestByParent.get(parentId) ?? null
    const isOriginal = job.parentJobId === null
    const isLatestInChain = latest
      ? job.id === latest.id
      : isOriginal && revisionCount === 0

    return {
      ...job,
      canAddRevision: canAddRevisionFrom(job, latestMap),
      hasRevisions: revisionCount > 0,
      revisionCount,
      latestRevisionId: latest?.id ?? null,
      latestRevisionLetter: latest?.revisionLetter ?? null,
      isLatestInChain,
    }
  })
}

/** Short label for list cards — e.g. "3 revisions (latest C)" or "Rev B · 3 in chain". */
export function revisionFamilyLabel(job: {
  parentJobId: string | null
  revisionLetter?: string | null
  hasRevisions?: boolean
  revisionCount?: number
  latestRevisionLetter?: string | null
  isLatestInChain?: boolean
}): string | null {
  const hasRevisions = job.hasRevisions ?? false
  if (!hasRevisions && !job.parentJobId) return null

  if (job.parentJobId && job.revisionLetter) {
    const chain = (job.revisionCount ?? 0) > 0
      ? ` · ${job.revisionCount} in chain`
      : ""
    const latest = job.isLatestInChain ? " · latest" : job.latestRevisionLetter
      ? ` · latest ${job.latestRevisionLetter}`
      : ""
    return `Rev ${job.revisionLetter}${chain}${latest}`
  }

  if (hasRevisions) {
    const latest = job.latestRevisionLetter ? ` (latest ${job.latestRevisionLetter})` : ""
    const n = job.revisionCount ?? 0
    return `${n} revision${n === 1 ? "" : "s"}${latest}`
  }

  return null
}
