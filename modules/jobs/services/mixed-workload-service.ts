/**
 * Mixed active workload: design work items + standalone non-design jobs.
 * Used when WORK_ITEMS_MODEL is on so SITE_VISIT / SURVEY / etc. stay visible.
 */
import { SINGLE_JOB_ITEM_TYPES } from "@/lib/migrations/work-items-backfill"
import { WORK_ITEM_ACTIVE_STATUSES } from "../supabase/work-item-repository"
import { jobService } from "./job-service"
import { workItemService } from "./parent-work-item-service"
import type { ActiveWorkItemListRow } from "../types/parent-dashboard-types"
import type { JobRow } from "../types/job-types"

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

export const mixedWorkloadService = {
  async findActive(opts: {
    search?: string
    status?: string
    designer?: string
    unassigned?: boolean
    skip?: number
    take?: number
  } = {}): Promise<{ rows: MixedWorkloadRow[]; total: number }> {
    const take = opts.take ?? 25
    const skip = opts.skip ?? 0

    // Fetch a wide window so we can merge + sort in memory (typical active counts << tens of thousands).
    const fetchTake = Math.min(500, Math.max(take * 4, 100))

    const [wiResult, allJobs] = await Promise.all([
      workItemService.findActiveList({
        search: opts.search,
        status: opts.status,
        designer: opts.designer,
        unassigned: opts.unassigned,
        skip: 0,
        take: fetchTake,
      }),
      jobService.findMany({
        where: {
          onlyOriginals: true,
          ...(opts.status ? { status: opts.status } : {}),
          ...(opts.designer ? { designer: opts.designer } : {}),
          ...(opts.unassigned ? { unassigned: true } : {}),
        },
        take: fetchTake,
        orderBy: { field: "updatedAt", dir: "desc" },
      }),
    ])

    const activeStatuses = new Set<string>(
      opts.status ? [opts.status] : [...WORK_ITEM_ACTIVE_STATUSES],
    )

    const nonDesign = allJobs.filter(j => {
      if (!SINGLE_JOB_ITEM_TYPES.has(j.itemType)) return false
      if (j.archivedAt) return false
      if (!activeStatuses.has(j.status)) return false
      if (opts.search && !matchesSearch(j, opts.search)) return false
      return true
    })

    const merged: MixedWorkloadRow[] = [
      ...wiResult.rows.map(designToRow),
      ...nonDesign.map(nonDesignToRow),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    const total = merged.length
    const rows = merged.slice(skip, skip + take)
    return { rows, total }
  },
}
