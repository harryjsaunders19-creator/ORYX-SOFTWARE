/**
 * Revision chain rules — the next revision is always created from the
 * latest revision in the chain (or from the original when none exist yet).
 */

export interface RevisionAnchorJob {
  id: string
  parentJobId: string | null
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
