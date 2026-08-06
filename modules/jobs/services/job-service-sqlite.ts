/**
 * Jobs — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads job-service-supabase.ts instead (isSupabaseOnly()).
 */
import type { CreateJobData, JobRow, UpdateJobData } from "../types/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { jobDb, commercialDb } from "@/lib/db/stores"
import { historyService } from "./history-service"
import { archiveLogService } from "@/modules/archive"
import { nowIso } from "@/lib/db/helpers"

async function ensureJobInSqlite(id: string): Promise<boolean> {
  return jobDb.findUnique(id) !== null
}

/** Public export for callers that need a pre-sync hook (no-op when already on SQLite). */
export { ensureJobInSqlite as ensureJobInSqliteForBilling }

export const jobService = {
  ensureJobInSqlite,

  async findManyWithCount(opts: FindManyOptions & {
    projection?: "list" | "scope-slim"
  } = {}): Promise<{
    jobs: JobRow[]
    total: number
    allForRevisions?: { id: string; parentJobId: string | null; revisionLetter?: string | null }[]
  }> {
    void opts.projection
    const w = opts.where ?? {}
    const {
      onlyOriginals: _o,
      status: _s,
      overdue: _ov,
      dueToday: _dt,
      dueThisWeek: _dw,
      unassigned: _u,
      ...rest
    } = w
    const [jobs, total, revRows] = await Promise.all([
      jobDb.findMany(opts),
      jobDb.count(w),
      jobDb.findMany({ where: { ...rest, onlyRevisions: true } }),
    ])
    return {
      jobs,
      total,
      allForRevisions: revRows.map(r => ({
        id: r.id,
        parentJobId: r.parentJobId,
        revisionLetter: r.revisionLetter,
        status: r.status,
        designer: r.designer,
        requiredByDate: r.requiredByDate,
        updatedAt: r.updatedAt,
        dateCompleted: r.dateCompleted,
        notes: r.notes,
        billable: r.billable ?? true,
      })),
    }
  },

  async findMany(opts: FindManyOptions = {}): Promise<JobRow[]> {
    return jobDb.findMany(opts)
  },

  async findAnalyticsFields(opts: {
    clientId: string
    take?: number
  }): Promise<{
    status: string
    itemType: string
    quoteValue: number | null
    dateCreated: string
    dateCompleted: string | null
  }[]> {
    const jobs = await jobDb.findMany({
      where: { clientId: opts.clientId },
      take: opts.take,
    })
    return jobs.map(j => ({
      status: j.status,
      itemType: j.itemType,
      quoteValue: j.quoteValue,
      dateCreated: j.dateCreated,
      dateCompleted: j.dateCompleted,
    }))
  },

  async findPerformanceFields(): Promise<{
    designer: string
    status: string
    dateCompleted: string | null
    requiredByDate: string | null
    updatedAt: string | null
  }[]> {
    return jobDb.findMany().map(j => ({
      designer: (j.designer ?? "").trim(),
      status: j.status,
      dateCompleted: j.dateCompleted,
      requiredByDate: j.requiredByDate,
      updatedAt: j.updatedAt ?? null,
    }))
  },

  async count(where: WhereClause = {}): Promise<number> {
    return jobDb.count(where)
  },

  async findUnique(id: string): Promise<JobRow | null> {
    return jobDb.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<JobRow[]> {
    return jobDb.findManyByIds(ids)
  },

  async revisionsForJob(parentId: string): Promise<JobRow[]> {
    return jobDb.revisionsForJob(parentId)
  },

  async findLatestRevisionsForParents(parentIds: string[]): Promise<JobRow[]> {
    if (!parentIds.length) return []
    return jobDb.findLatestRevisionsForParents(parentIds)
  },

  async create(data: CreateJobData): Promise<JobRow> {
    return jobDb.create(data)
  },

  async update(id: string, data: UpdateJobData): Promise<JobRow | null> {
    return jobDb.update(id, data)
  },

  async assignDesigner(id: string, designer: string, changedBy: string): Promise<{ job: JobRow } | null> {
    return jobDb.assignDesigner(id, designer, changedBy)
  },

  deletionBlockers(id: string): string[] {
    return jobDb.deletionBlockers(id)
  },

  async archive(id: string, archiverId: string, archiverName: string, reason: string): Promise<JobRow | null> {
    const now = nowIso()
    const job = jobDb.findUnique(id)
    if (!job) return null
    jobDb.archive(id, archiverId, now)
    // Soft-cancel: drop uncleared billing queue rows; keep cleared history.
    jobDb._retractBillingHandoffOnRevert(id)
    const updated = jobDb.findUnique(id)
    archiveLogService.log({
      entityType: "job", entityId: id,
      entityLabel: job.drawingNumber,
      action: "archive",
      performedBy: archiverId, performedByName: archiverName,
      reason,
    })
    return updated
  },

  async restore(id: string, restorerId: string, restorerName: string): Promise<JobRow | null> {
    const now = nowIso()
    const job = jobDb.findUnique(id)
    if (!job) return null
    jobDb.restore(id, now)
    const updated = jobDb.findUnique(id)
    archiveLogService.log({
      entityType: "job", entityId: id,
      entityLabel: job.drawingNumber,
      action: "restore",
      performedBy: restorerId, performedByName: restorerName,
    })
    return updated
  },

  async findArchived(): Promise<JobRow[]> {
    return jobDb.findArchived()
  },

  async delete(id: string): Promise<boolean> {
    const ok = jobDb.delete(id)
    if (ok) await historyService.deleteForJob(id)
    return ok
  },

  async syncFromSqlite(id: string): Promise<JobRow | null> {
    return jobDb.findUnique(id)
  },

  async setDrawingNumber(id: string, drawingNumber: string): Promise<JobRow | null> {
    const existing = jobDb.findUnique(id)
    if (!existing) return null
    jobDb.setDrawingNumber(id, drawingNumber)
    return this.syncFromSqlite(id)
  },

  distinctDesigners(): string[] {
    return jobDb.distinctDesigners()
  },

  async groupByStatus(): Promise<{ status: string; count: number }[]> {
    return jobDb.groupByStatus()
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    return jobDb.groupByItemType()
  },

  async findRecent(take: number) {
    return jobDb.findRecent(take)
  },

  async findOverduePreview(take = 5) {
    return jobDb.overdueJobs().slice(0, take)
  },

  async countWhere(where: Parameters<typeof jobDb.countWhere>[0]): Promise<number> {
    return jobDb.countWhere(where)
  },

  async deadlineStats(): Promise<{ overdueCount: number; dueTodayCount: number; dueThisWeekCount: number }> {
    return jobDb.deadlineStats()
  },

  async dashboardCounts(): Promise<{
    byStatus:         { status: string; count: number }[]
    byItemType:       { itemType: string; count: number }[]
    unassigned:       number
    totalActiveJobs:  number
    activeRevisions:  number
    overdueCount:     number
    dueTodayCount:    number
    dueThisWeekCount: number
  }> {
    const [byStatus, byItemType, unassigned, totalActiveJobs, activeRevisions, deadlines] =
      await Promise.all([
        jobDb.groupByStatus(),
        jobDb.groupByItemType(),
        jobDb.countWhere({ unassigned: true }),
        jobDb.countActiveOriginals(),
        jobDb.countActiveRevisions(),
        jobDb.deadlineStats(),
      ])
    return { byStatus, byItemType, unassigned, totalActiveJobs, activeRevisions, ...deadlines }
  },

  async totalQuotedValue(): Promise<number> {
    return commercialDb.totalQuotedValue()
  },

  async totalIssuedValue(): Promise<number> {
    return commercialDb.totalIssuedValue()
  },

  async avgJobValue(): Promise<number> {
    return commercialDb.avgJobValue()
  },

  async jobValueStats(): Promise<{ totalQuotedValue: number; totalIssuedValue: number; avgJobValue: number }> {
    const [totalQuotedValue, totalIssuedValue, avgJobValue] = await Promise.all([
      commercialDb.totalQuotedValue(),
      commercialDb.totalIssuedValue(),
      commercialDb.avgJobValue(),
    ])
    return { totalQuotedValue, totalIssuedValue, avgJobValue }
  },

  async saveGeocode(
    id: string,
    latitude: number,
    longitude: number,
    geocodedAddress: string,
  ): Promise<JobRow | null> {
    if (!(await ensureJobInSqlite(id))) return null
    return jobDb.saveGeocode(id, latitude, longitude, geocodedAddress)
  },

  async saveManualLocation(
    id: string,
    latitude: number,
    longitude: number,
  ): Promise<JobRow | null> {
    if (!(await ensureJobInSqlite(id))) return null
    return jobDb.saveLocation(id, latitude, longitude, "manual", "manual", null)
  },

  async markLocationNeedsReview(id: string): Promise<JobRow | null> {
    if (!(await ensureJobInSqlite(id))) return null
    return jobDb.markLocationNeedsReview(id)
  },
}
