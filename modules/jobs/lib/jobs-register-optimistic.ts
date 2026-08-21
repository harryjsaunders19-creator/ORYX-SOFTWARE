/**
 * Jobs Register optimistic cache helpers.
 *
 * Patch only the currently visible list cache. Scope counts stay authoritative
 * via background revalidation — we do not re-implement SQL scope tallies here.
 */

import {
  isCompleteStatus,
  matchesJobsListScope,
  type CurrentWorkType,
  type JobsListScope,
} from "./current-work"

export type ClassicJobsListCache = {
  jobs: Array<Record<string, unknown> & { id: string }>
  total?: number
  page?: number
  limit?: number
  scopeCounts?: {
    all: number
    active: number
    revisions: number
    completed: number
  }
}

export type WorkItemsListCache = {
  workItems: Array<Record<string, unknown> & { id: string; parentJobId?: string }>
  total?: number
  page?: number
  pages?: number
  scopeCounts?: ClassicJobsListCache["scopeCounts"]
}

/**
 * Predict currentWorkType after a status PATCH on the *current work item*.
 *
 * - original: ISSUED → none; otherwise original
 * - revision: ISSUED → parent still open ? original : none; otherwise revision
 * - none: not normally editable from the register; treat reopen as original
 */
export function predictWorkTypeAfterStatusChange(opts: {
  previousWorkType: CurrentWorkType | string
  nextStatus: string
  /** Parent/original design status (independent of revision). */
  projectStatus: string
}): CurrentWorkType {
  const prev = (opts.previousWorkType || "none") as CurrentWorkType
  const nextComplete = isCompleteStatus(opts.nextStatus)

  if (prev === "revision") {
    if (!nextComplete) return "revision"
    return isCompleteStatus(opts.projectStatus) ? "none" : "original"
  }

  if (prev === "original") {
    return nextComplete ? "none" : "original"
  }

  // Fully closed row — reopen path (inspector); register normally blocks edit.
  return nextComplete ? "none" : "original"
}

export function shouldRemoveFromScope(
  nextWorkType: CurrentWorkType,
  scope: JobsListScope,
): boolean {
  return !matchesJobsListScope(nextWorkType, scope)
}

/** Snapshot fields needed to roll back a classic Jobs list row. */
export function snapshotClassicJobRow(
  job: Record<string, unknown>,
): Record<string, unknown> {
  return {
    status: job.status,
    currentStatus: job.currentStatus,
    designer: job.designer,
    currentDesigner: job.currentDesigner,
    currentWorkType: job.currentWorkType,
    currentRevisionId: job.currentRevisionId,
    currentRevisionLetter: job.currentRevisionLetter,
  }
}

/**
 * Apply a status change to a classic list job row.
 * When editing a revision, do **not** overwrite the parent `status` column.
 */
export function applyClassicStatusPatch(
  job: Record<string, unknown> & { id: string },
  opts: {
    nextStatus: string
    editingRevision: boolean
    nextWorkType: CurrentWorkType
  },
): Record<string, unknown> & { id: string } {
  const next: Record<string, unknown> & { id: string } = {
    ...job,
    currentStatus: opts.nextStatus,
  }
  if (!opts.editingRevision) {
    next.status = opts.nextStatus
  }
  // Keep list overlay consistent for jobToRegisterProject.
  if (opts.nextWorkType === "none") {
    // Leave currentRevisionId as-is; issued revision is ignored by getCurrentWorkItem.
  }
  return next
}

export function applyClassicDesignerPatch(
  job: Record<string, unknown> & { id: string },
  nextDesigner: string,
  editingRevision: boolean,
): Record<string, unknown> & { id: string } {
  const next: Record<string, unknown> & { id: string } = {
    ...job,
    currentDesigner: nextDesigner,
  }
  // Row display uses current designer; parent designer column only when editing original.
  if (!editingRevision) {
    next.designer = nextDesigner
  }
  return next
}

export function patchClassicJobsCache(
  current: ClassicJobsListCache | undefined,
  opts: {
    projectId: string
    scope: JobsListScope
    patch: (
      job: Record<string, unknown> & { id: string },
    ) => Record<string, unknown> & { id: string }
    /** When set, remove the row if it no longer matches scope. */
    nextWorkType?: CurrentWorkType
  },
): ClassicJobsListCache | undefined {
  if (!current?.jobs) return current
  const idx = current.jobs.findIndex(j => j.id === opts.projectId)
  if (idx < 0) return current

  const patched = opts.patch(current.jobs[idx]!)
  const leave =
    opts.nextWorkType != null
    && shouldRemoveFromScope(opts.nextWorkType, opts.scope)

  if (leave) {
    const jobs = current.jobs.filter(j => j.id !== opts.projectId)
    const total = current.total != null ? Math.max(0, current.total - 1) : current.total
    return { ...current, jobs, total }
  }

  const jobs = current.jobs.slice()
  jobs[idx] = patched
  return { ...current, jobs }
}

export function patchWorkItemsCache(
  current: WorkItemsListCache | undefined,
  opts: {
    projectId: string
    scope: JobsListScope
    patch: (
      row: Record<string, unknown> & { id: string; parentJobId?: string },
    ) => Record<string, unknown> & { id: string; parentJobId?: string }
    nextWorkType?: CurrentWorkType
  },
): WorkItemsListCache | undefined {
  if (!current?.workItems) return current

  let changed = false
  let removed = false
  const workItems: WorkItemsListCache["workItems"] = []

  for (const row of current.workItems) {
    const match = row.parentJobId === opts.projectId || row.id === opts.projectId
    if (!match) {
      workItems.push(row)
      continue
    }
    changed = true
    const patched = opts.patch(row)
    if (
      opts.nextWorkType != null
      && shouldRemoveFromScope(opts.nextWorkType, opts.scope)
    ) {
      removed = true
      continue
    }
    workItems.push(patched)
  }

  if (!changed) return current
  const total = removed && current.total != null
    ? Math.max(0, current.total - 1)
    : current.total
  return { ...current, workItems, total }
}

/**
 * Per-row pending mutation counter — soft-revalidate only when the last
 * in-flight mutation for that row finishes, so an older revalidation cannot
 * clobber a newer optimistic edit.
 */
export function createPendingMutationGate() {
  const pending = new Map<string, number>()

  return {
    begin(id: string) {
      pending.set(id, (pending.get(id) ?? 0) + 1)
    },
    end(id: string): boolean {
      const next = (pending.get(id) ?? 1) - 1
      if (next <= 0) {
        pending.delete(id)
        return true
      }
      pending.set(id, next)
      return false
    },
    isPending(id: string): boolean {
      return (pending.get(id) ?? 0) > 0
    },
  }
}
