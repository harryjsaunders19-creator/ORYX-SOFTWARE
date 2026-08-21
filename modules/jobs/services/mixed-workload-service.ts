/**
 * Mixed active workload: design work items + standalone non-design jobs.
 * Used when WORK_ITEMS_MODEL is on so SITE_VISIT / SURVEY / etc. stay visible.
 *
 * Scope semantics mirror classic Jobs list tabs via matchesJobsListScope /
 * current-work classification on each row (see workItemToRegisterProject).
 */
import { SINGLE_JOB_ITEM_TYPES } from "@/lib/migrations/work-items-backfill"
import { WORK_ITEM_ACTIVE_STATUSES } from "../supabase/work-item-repository"
import { jobService } from "./job-service"
import { workItemService } from "./parent-work-item-service"
import type { ActiveWorkItemListRow } from "../types/parent-dashboard-types"
import type { JobRow } from "../types/job-types"
import {
  parseJobsListScope,
  tallyJobsListScopeCounts,
  isCompleteStatus,
  type JobsListScope,
  type JobsListScopeCounts,
} from "../lib/current-work"

/** Cap for merge-then-page (same order of magnitude as classic list export overlay). */
const MAX_MIXED_MERGE_ROWS = 5_000
const FETCH_PAGE = 1_000

export type MixedWorkloadRow = ActiveWorkItemListRow & {
  /** DESIGN work item vs standalone non-design Job row. */
  kind: "work_item" | "job"
  itemType: string
}

function nonDesignToRow(job: JobRow): MixedWorkloadRow {
  return {
    kind: "job",
    itemType: job.itemType,
    id: job.id,
    parentJobId: job.id,
    drawingNumber: job.drawingNumber,
    workLabel: job.itemType.replace(/_/g, " "),
    workType: "ORIGINAL",
    revisionLetter: null,
    clientCompany: job.clientCompany,
    siteName: job.siteName,
    address: job.address,
    designer: job.designer ?? "",
    status: job.status,
    requiredByDate: job.requiredByDate,
    billable: job.billable ?? true,
    quoteValue: job.quoteValue,
    priority: null,
    updatedAt: job.updatedAt,
  }
}

function designToRow(row: ActiveWorkItemListRow): MixedWorkloadRow {
  return {
    ...row,
    kind: "work_item",
    itemType: row.workType === "REVISION" ? "REVISION" : "DESIGN",
  }
}

function matchesSearch(job: JobRow, search: string): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return [
    job.drawingNumber,
    job.clientCompany,
    job.address,
    job.siteName,
    job.designer,
  ].some(v => (v ?? "").toLowerCase().includes(q))
}

/** Statuses to query for a Jobs Register scope (work-items model). */
export function statusesForMixedScope(
  scope: JobsListScope,
  explicitStatus?: string,
): string[] {
  if (explicitStatus) return [explicitStatus]
  switch (scope) {
    case "completed":
      return ["ISSUED"]
    case "all":
      return [...WORK_ITEM_ACTIVE_STATUSES, "ISSUED"]
    case "active":
    case "revisions":
    default:
      return [...WORK_ITEM_ACTIVE_STATUSES]
  }
}

/** Derive register currentWorkType for a mixed row (same rules as workItemToRegisterProject). */
export function mixedRowCurrentWorkType(
  row: Pick<MixedWorkloadRow, "workType" | "status">,
): "original" | "revision" | "none" {
  const complete = isCompleteStatus(row.status)
  if (complete) return "none"
  if (row.workType === "REVISION") return "revision"
  return "original"
}

function jobStatusesForScope(scope: JobsListScope, explicitStatus?: string): string[] | null {
  // null = no status filter beyond non-design + not archived
  if (explicitStatus) return [explicitStatus]
  switch (scope) {
    case "completed":
      return ["ISSUED"]
    case "revisions":
      // Standalone non-design jobs are never "revision" current-work.
      return null
    case "all":
      return [...WORK_ITEM_ACTIVE_STATUSES, "ISSUED"]
    case "active":
    default:
      return [...WORK_ITEM_ACTIVE_STATUSES]
  }
}

async function fetchAllMatchingWorkItems(opts: {
  search?: string
  status?: string
  statuses: string[]
  workType?: "ORIGINAL" | "REVISION"
  designer?: string
  unassigned?: boolean
}): Promise<ActiveWorkItemListRow[]> {
  const out: ActiveWorkItemListRow[] = []
  let skip = 0
  for (;;) {
    const { rows, total } = await workItemService.findActiveList({
      search: opts.search,
      status: opts.status,
      statuses: opts.status ? undefined : opts.statuses,
      workType: opts.workType,
      designer: opts.designer,
      unassigned: opts.unassigned,
      skip,
      take: FETCH_PAGE,
    })
    out.push(...rows)
    skip += rows.length
    if (rows.length === 0 || out.length >= total || out.length >= MAX_MIXED_MERGE_ROWS) break
  }
  return out.slice(0, MAX_MIXED_MERGE_ROWS)
}

async function fetchAllMatchingNonDesignJobs(opts: {
  search?: string
  statuses: string[] | null
  designer?: string
  unassigned?: boolean
  includeNonDesign: boolean
}): Promise<JobRow[]> {
  if (!opts.includeNonDesign) return []
  const out: JobRow[] = []
  let skip = 0
  for (;;) {
    const batch = await jobService.findMany({
      where: {
        onlyOriginals: true,
        ...(opts.statuses?.length === 1 ? { status: opts.statuses[0] } : {}),
        ...(opts.designer ? { designer: opts.designer } : {}),
        ...(opts.unassigned ? { unassigned: true } : {}),
      },
      take: FETCH_PAGE,
      skip,
      orderBy: { field: "updatedAt", dir: "desc" },
    })
    // When multiple statuses, filter in memory (FindManyOptions status is single-value).
    const filtered = batch.filter(j => {
      if (!SINGLE_JOB_ITEM_TYPES.has(j.itemType)) return false
      if (j.archivedAt) return false
      if (opts.statuses && opts.statuses.length > 1 && !opts.statuses.includes(j.status)) return false
      if (opts.statuses && opts.statuses.length === 1 && j.status !== opts.statuses[0]) return false
      if (opts.search && !matchesSearch(j, opts.search)) return false
      return true
    })
    out.push(...filtered)
    skip += batch.length
    if (batch.length < FETCH_PAGE || out.length >= MAX_MIXED_MERGE_ROWS) break
    // Avoid infinite loop when status filter empties pages but more rows exist
    if (batch.length === 0) break
  }
  return out.slice(0, MAX_MIXED_MERGE_ROWS)
}

export const mixedWorkloadService = {
  async findActive(opts: {
    search?: string
    status?: string
    designer?: string
    unassigned?: boolean
    scope?: string | null
    skip?: number
    take?: number
  } = {}): Promise<{
    rows: MixedWorkloadRow[]
    total: number
    scopeCounts: JobsListScopeCounts
  }> {
    const take = opts.take ?? 25
    const skip = opts.skip ?? 0
    const scope = parseJobsListScope(opts.scope)
    const wiStatuses = statusesForMixedScope(scope, opts.status)
    const jobStatuses = jobStatusesForScope(scope, opts.status)
    const workType = scope === "revisions" ? "REVISION" as const : undefined
    const includeNonDesign = scope !== "revisions"

    const [wiRows, jobRows] = await Promise.all([
      fetchAllMatchingWorkItems({
        search: opts.search,
        status: opts.status,
        statuses: wiStatuses,
        workType,
        designer: opts.designer,
        unassigned: opts.unassigned,
      }),
      fetchAllMatchingNonDesignJobs({
        search: opts.search,
        statuses: jobStatuses,
        designer: opts.designer,
        unassigned: opts.unassigned,
        includeNonDesign,
      }),
    ])

    const merged: MixedWorkloadRow[] = [
      ...wiRows.map(designToRow),
      ...jobRows.map(nonDesignToRow),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    // Defensive: apply scope on derived current-work (should already match query filters).
    const scoped = merged.filter(row => {
      const type = mixedRowCurrentWorkType(row)
      if (scope === "all") return true
      if (scope === "active") return type !== "none"
      if (scope === "revisions") return type === "revision"
      if (scope === "completed") return type === "none"
      return true
    })

    const withTypes = scoped.map(row => ({
      currentWorkType: mixedRowCurrentWorkType(row),
    }))
    const scopeCounts = tallyJobsListScopeCounts(withTypes)

    const total = scoped.length
    const rows = scoped.slice(skip, skip + take)
    return { rows, total, scopeCounts }
  },
}
