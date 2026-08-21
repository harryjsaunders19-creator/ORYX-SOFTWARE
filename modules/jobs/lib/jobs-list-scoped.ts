/**
 * Jobs Register scoped list — semantics reference + pure paging helper.
 *
 * ## Scope / tab mapping (classic Jobs, onlyOriginals=true)
 *
 * Records: non-archived originals (`parent_job_id IS NULL`, `archived_at IS NULL`).
 * Revisions are never list rows; they only feed current-work derivation.
 *
 * | Scope       | Qualifying currentWorkType                          |
 * |-------------|-----------------------------------------------------|
 * | all         | original | revision | none                          |
 * | active      | original | revision  (type !== none)                |
 * | revisions   | revision only                                       |
 * | completed   | none only (parent complete AND no active revision)  |
 *
 * Status / designer / deadline filters apply to **current** display fields
 * (latest active revision, else active original, else parent ISSUED), not the
 * raw parent columns. Search and clientId apply to the **original** row only
 * (same as PostgREST findManyWithCount with onlyOriginals).
 *
 * Scope counts are tallied after status/deadline/unassigned filters, before
 * the scope tab slice — so counts stay stable across tab switches for the
 * same search/client/status filters.
 *
 * Archived originals are excluded. Soft-cancelled jobs are archived; there is
 * no separate CANCELLED status. Revision rows are included in current-work
 * even when archived (matches existing sidecar fetch).
 *
 * Sort (register default): list_sort_key ASC, created_at ASC.
 *
 * Billable / free revisions do not change current-work type selection.
 */

import {
  matchesJobsListScope,
  tallyJobsListScopeCounts,
  type JobsListScope,
  type JobsListScopeCounts,
} from "./current-work"
import {
  filterByCurrentDisplay,
  flagRevisions,
  type JobsListOverlayJob,
  type JobsListOverlayRevision,
} from "./jobs-list-overlay"

export type ScopedListParent = JobsListOverlayJob & {
  listSortKey?: string | null
  createdAt?: string
  drawingNumber?: string
  clientId?: string | null
  itemType?: string
  typeOfWorks?: string
  address?: string
  clientCompany?: string
  requestedBy?: string
  quoteReference?: string | null
  customTypeDescription?: string | null
  tags?: string[]
}

export type ScopedListInput = {
  parents: ScopedListParent[]
  revisions: JobsListOverlayRevision[]
  scope: JobsListScope
  page: number
  pageSize: number
  status?: string
  unassigned?: boolean
  overdue?: boolean
  dueToday?: boolean
  dueThisWeek?: boolean
  today?: string
  weekStart?: string
  weekEnd?: string
  sortDir?: "asc" | "desc"
}

export type ScopedListResult = {
  ids: string[]
  total: number
  scopeCounts: JobsListScopeCounts
  /** Full scoped id order (for tests / export). */
  allIds: string[]
}

function sortParents<T extends ScopedListParent>(rows: T[], dir: "asc" | "desc"): T[] {
  const mul = dir === "desc" ? -1 : 1
  return [...rows].sort((a, b) => {
    const ka = a.listSortKey ?? a.drawingNumber ?? a.id
    const kb = b.listSortKey ?? b.drawingNumber ?? b.id
    const byKey = String(ka).localeCompare(String(kb))
    if (byKey !== 0) return byKey * mul
    const byCreated = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))
    return byCreated * mul
  })
}

/**
 * Pure Node implementation of Jobs Register scoped paging — mirrors SQL RPC
 * `jobs_list_scoped_page` and the historical flagRevisions → filter → slice path.
 * No artificial row cap.
 */
export function paginateScopedJobsList(input: ScopedListInput): ScopedListResult {
  const page = Math.max(1, input.page)
  const pageSize = Math.max(1, input.pageSize)
  const sortDir = input.sortDir ?? "asc"

  const originals = input.parents.filter(p => p.parentJobId === null)
  let enriched = flagRevisions(sortParents(originals, sortDir), input.revisions)

  const needsCurrentFilter = !!(
    input.status || input.unassigned || input.overdue || input.dueToday || input.dueThisWeek
  )
  if (needsCurrentFilter) {
    enriched = filterByCurrentDisplay(
      enriched.map(j => ({ ...j, status: j.status ?? "" })),
      {
        status: input.status,
        unassigned: input.unassigned,
        overdue: input.overdue,
        dueToday: input.dueToday,
        dueThisWeek: input.dueThisWeek,
        today: input.today,
        weekStart: input.weekStart,
        weekEnd: input.weekEnd,
      },
    ) as typeof enriched
  }

  const parents = enriched.filter(j => j.parentJobId === null)
  const scopeCounts = tallyJobsListScopeCounts(parents)
  const scoped = input.scope === "all"
    ? parents
    : parents.filter(j => matchesJobsListScope(j.currentWorkType, input.scope))

  const allIds = scoped.map(j => j.id)
  const start = (page - 1) * pageSize
  const ids = allIds.slice(start, start + pageSize)

  return {
    ids,
    total: allIds.length,
    scopeCounts,
    allIds,
  }
}
