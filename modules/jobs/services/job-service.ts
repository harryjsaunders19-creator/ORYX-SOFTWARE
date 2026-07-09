/**
 * lib/services/job-service.ts
 *
 * Job operations during Supabase migration.
 *
 * When SUPABASE_JOBS=true:
 *   - Reads come from Supabase
 *   - Writes run through SQLite first (StatusHistory, BillingHandoff side effects),
 *     then mirror the job row to Supabase
 *
 * When flag is false (default): everything uses SQLite only.
 */
import type { CreateJobData, JobRow, UpdateJobData } from "../types/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { jobDb, commercialDb } from "@/lib/db/stores"
import { allocateDrawingNumber } from "@/lib/db"
import { useSupabaseJobs } from "@/lib/supabase/feature-flags"
import { supabaseJobRepo, isDuplicateDrawingNumberError } from "../supabase/repository"
import { historyService } from "./history-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { ensureClientInSqlite } from "@/lib/services/client-service"
import { archiveLogService } from "@/lib/services/archive-log-service"
import { nowIso } from "@/lib/db/helpers"
import { probeArchivedColumns } from "@/lib/supabase/archived-filter"
import { ensureSequencesSeeded } from "@/lib/supabase/seed-sequences"

async function mirror(job: JobRow | null) {
  if (job && useSupabaseJobs()) await supabaseJobRepo.upsert(job)
}

async function mirrorHistory(jobId: string) {
  try {
    await historyService.syncForJob(jobId)
    await billingHandoffService.syncJobHandoffs(jobId)
  } catch (err) {
    console.warn("[jobService] mirrorHistory failed (job saved):", err)
  }
}

/** Mirror a newly created job to Supabase; retry on drawing-number collisions. */
async function mirrorNewJob(job: JobRow): Promise<JobRow> {
  let current = job
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await mirror(current)
      await mirrorHistory(current.id)
      return current
    } catch (err) {
      if (attempt < 9 && isDuplicateDrawingNumberError(err) && current.itemType === "DESIGN") {
        const drawingNumber = allocateDrawingNumber()
        jobDb.setDrawingNumber(current.id, drawingNumber)
        current = jobDb.findUnique(current.id)!
        continue
      }
      throw err
    }
  }
  throw new Error("Failed to save new job after drawing-number retries")
}

/**
 * Ensures a job exists in the local SQLite DB by fetching it from Supabase
 * if missing. On Vercel the ephemeral /tmp SQLite starts empty, so jobs
 * created in earlier containers only exist in Supabase. Syncing down before
 * writes lets all the normal SQLite-side-effect paths (status history, FK
 * constraints for revisions, billing handoff) work correctly.
 */
async function ensureJobInSqlite(id: string): Promise<boolean> {
  if (!useSupabaseJobs()) return jobDb.findUnique(id) !== null
  if (jobDb.findUnique(id)) return true
  const job = await supabaseJobRepo.findUnique(id)
  if (!job) return false
  // Pre-sync dependencies so SQLite FK constraints don't block the insert:
  // 1. The job's client (Job.clientId is nullable TEXT — no FK in SQLite Job table,
  //    but other tables like Quote reference Client, so keep it consistent).
  // 2. The parent job if this is a revision (Job.parentJobId REFERENCES Job(id)).
  await ensureClientInSqlite(job.clientId)
  if (job.parentJobId && !jobDb.findUnique(job.parentJobId)) {
    const parent = await supabaseJobRepo.findUnique(job.parentJobId)
    if (parent) {
      await ensureClientInSqlite(parent.clientId)
      jobDb.rawInsertOrIgnore(parent)
    }
  }
  jobDb.rawInsertOrIgnore(job)
  return jobDb.findUnique(id) !== null
}

/** Public export for services that need to pre-sync a job without using jobService (avoids circular deps). */
export { ensureJobInSqlite as ensureJobInSqliteForBilling }

export const jobService = {
  ensureJobInSqlite,
  /**
   * Returns a page of jobs + total in ONE Supabase request.
   * When sorting by drawing number (default) also returns `allForRevisions`
   * so the caller can compute canAddRevision without a second round trip.
   */
  async findManyWithCount(opts: FindManyOptions = {}): Promise<{
    jobs: JobRow[]
    total: number
    allForRevisions?: { id: string; parentJobId: string | null }[]
  }> {
    if (!useSupabaseJobs()) {
      const [jobs, total] = await Promise.all([
        jobDb.findMany(opts),
        jobDb.count(opts.where ?? {}),
      ])
      return { jobs, total }
    }
    return supabaseJobRepo.findManyWithCount(opts)
  },

  async findMany(opts: FindManyOptions = {}): Promise<JobRow[]> {
    if (!useSupabaseJobs()) return jobDb.findMany(opts)
    return supabaseJobRepo.findMany(opts)
  },

  async count(where: WhereClause = {}): Promise<number> {
    if (!useSupabaseJobs()) return jobDb.count(where)
    return supabaseJobRepo.count(where)
  },

  async findUnique(id: string): Promise<JobRow | null> {
    if (!useSupabaseJobs()) return jobDb.findUnique(id)
    return supabaseJobRepo.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<JobRow[]> {
    if (!useSupabaseJobs()) return jobDb.findManyByIds(ids)
    return supabaseJobRepo.findManyByIds(ids)
  },

  async revisionsForJob(parentId: string): Promise<JobRow[]> {
    if (!useSupabaseJobs()) return jobDb.revisionsForJob(parentId)
    return supabaseJobRepo.revisionsForJob(parentId)
  },

  async findLatestRevisionsForParents(parentIds: string[]): Promise<JobRow[]> {
    if (!parentIds.length) return []
    if (!useSupabaseJobs()) return jobDb.findLatestRevisionsForParents(parentIds)
    return supabaseJobRepo.findLatestRevisionsForParents(parentIds)
  },

  async create(data: CreateJobData): Promise<JobRow> {
    if (useSupabaseJobs()) await ensureSequencesSeeded()
    if (data.clientId) await ensureClientInSqlite(data.clientId)
    // If this is a revision, its parentJobId must exist in SQLite for FK constraints.
    if (data.parentJobId) await ensureJobInSqlite(data.parentJobId)
    const job = jobDb.create(data)
    if (useSupabaseJobs()) return mirrorNewJob(job)
    return job
  },

  async update(id: string, data: UpdateJobData): Promise<JobRow | null> {
    await ensureJobInSqlite(id)
    const job = jobDb.update(id, data)
    await mirror(job)
    if (job) await mirrorHistory(id)
    return job
  },

  async assignDesigner(id: string, designer: string, changedBy: string): Promise<{ job: JobRow } | null> {
    await ensureJobInSqlite(id)
    const result = jobDb.assignDesigner(id, designer, changedBy)
    if (result) {
      await mirror(result.job)
      await mirrorHistory(id)
    }
    return result
  },

  deletionBlockers(id: string): string[] {
    return jobDb.deletionBlockers(id)
  },

  /** Soft-delete a job: marks it as archived. Logs the action. */
  async archive(id: string, archiverId: string, archiverName: string, reason: string): Promise<JobRow | null> {
    const now = nowIso()

    if (useSupabaseJobs()) {
      await probeArchivedColumns()
      const remote = await supabaseJobRepo.findUnique(id)
      if (!remote) return null
      const ok = await supabaseJobRepo.archive(id, archiverId, now)
      if (!ok) return null
      const updated = await supabaseJobRepo.findUnique(id)
      try {
        await ensureJobInSqlite(id)
        jobDb.archive(id, archiverId, now)
      } catch (err) {
        console.warn("[jobService.archive] SQLite mirror failed:", err)
      }
      archiveLogService.log({
        entityType: "job", entityId: id,
        entityLabel: remote.drawingNumber,
        action: "archive",
        performedBy: archiverId, performedByName: archiverName,
        reason,
      })
      return updated
    }

    await ensureJobInSqlite(id)
    const job = jobDb.findUnique(id)
    if (!job) return null
    jobDb.archive(id, archiverId, now)
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

  /** Restore a previously archived job. */
  async restore(id: string, restorerId: string, restorerName: string): Promise<JobRow | null> {
    const now = nowIso()

    if (useSupabaseJobs()) {
      const remote = await supabaseJobRepo.findUnique(id)
      if (!remote) return null
      const ok = await supabaseJobRepo.restore(id, now)
      if (!ok) return null
      const updated = await supabaseJobRepo.findUnique(id)
      try {
        await ensureJobInSqlite(id)
        jobDb.restore(id, now)
      } catch (err) {
        console.warn("[jobService.restore] SQLite mirror failed:", err)
      }
      archiveLogService.log({
        entityType: "job", entityId: id,
        entityLabel: remote.drawingNumber,
        action: "restore",
        performedBy: restorerId, performedByName: restorerName,
      })
      return updated
    }

    await ensureJobInSqlite(id)
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
    if (!useSupabaseJobs()) return jobDb.findArchived()
    return supabaseJobRepo.findArchived()
  },

  async delete(id: string): Promise<boolean> {
    await ensureJobInSqlite(id)
    const ok = jobDb.delete(id)
    if (ok) {
      if (useSupabaseJobs()) await supabaseJobRepo.delete(id)
      await historyService.deleteForJob(id)
    }
    return ok
  },

  /** After a direct SQLite patch (e.g. drawing-number admin edit). */
  async syncFromSqlite(id: string): Promise<JobRow | null> {
    const job = jobDb.findUnique(id)
    await mirror(job)
    await mirrorHistory(id)
    return job
  },

  /** Stats/billing routes — still SQLite until those modules migrate. */
  distinctDesigners(): string[] {
    return jobDb.distinctDesigners()
  },

  async groupByStatus(): Promise<{ status: string; count: number }[]> {
    if (!useSupabaseJobs()) return jobDb.groupByStatus()
    return supabaseJobRepo.groupByStatus()
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    if (!useSupabaseJobs()) return jobDb.groupByItemType()
    return supabaseJobRepo.groupByItemType()
  },

  async findRecent(take: number) {
    if (!useSupabaseJobs()) return jobDb.findRecent(take)
    return supabaseJobRepo.findRecent(take)
  },

  async countWhere(where: Parameters<typeof jobDb.countWhere>[0]): Promise<number> {
    if (!useSupabaseJobs()) return jobDb.countWhere(where)
    return supabaseJobRepo.count(where)
  },

  async deadlineStats(): Promise<{ overdueCount: number; dueTodayCount: number; dueThisWeekCount: number }> {
    if (!useSupabaseJobs()) return jobDb.deadlineStats()
    return supabaseJobRepo.deadlineStats()
  },

  /**
   * Returns all dashboard count aggregates in a single Supabase round trip.
   * Replaces 8 separate countWhere/groupBy/deadlineStats calls on the stats
   * endpoint. Falls back to the individual SQLite helpers.
   */
  async dashboardCounts(): Promise<{
    byStatus:         { status: string; count: number }[]
    byItemType:       { itemType: string; count: number }[]
    unassigned:       number
    totalActiveJobs:  number
    totalRevisions:   number
    overdueCount:     number
    dueTodayCount:    number
    dueThisWeekCount: number
  }> {
    if (!useSupabaseJobs()) {
      const [byStatus, byItemType, unassigned, totalActiveJobs, totalRevisions, deadlines] =
        await Promise.all([
          jobDb.groupByStatus(),
          jobDb.groupByItemType(),
          jobDb.countWhere({ unassigned: true }),
          jobDb.countWhere({ onlyOriginals: true }),
          jobDb.countWhere({ onlyRevisions: true }),
          jobDb.deadlineStats(),
        ])
      return { byStatus, byItemType, unassigned, totalActiveJobs, totalRevisions, ...deadlines }
    }
    return supabaseJobRepo.dashboardCounts()
  },

  async totalQuotedValue(): Promise<number> {
    if (!useSupabaseJobs()) return commercialDb.totalQuotedValue()
    return (await supabaseJobRepo.jobValueStats()).totalQuotedValue
  },

  async totalIssuedValue(): Promise<number> {
    if (!useSupabaseJobs()) return commercialDb.totalIssuedValue()
    return (await supabaseJobRepo.jobValueStats()).totalIssuedValue
  },

  async avgJobValue(): Promise<number> {
    if (!useSupabaseJobs()) return commercialDb.avgJobValue()
    return (await supabaseJobRepo.jobValueStats()).avgJobValue
  },

  /**
   * Returns totalQuotedValue, totalIssuedValue and avgJobValue in one query.
   * On the Supabase path this replaces three separate round trips with one.
   */
  async jobValueStats(): Promise<{ totalQuotedValue: number; totalIssuedValue: number; avgJobValue: number }> {
    if (!useSupabaseJobs()) {
      const [totalQuotedValue, totalIssuedValue, avgJobValue] = await Promise.all([
        commercialDb.totalQuotedValue(),
        commercialDb.totalIssuedValue(),
        commercialDb.avgJobValue(),
      ])
      return { totalQuotedValue, totalIssuedValue, avgJobValue }
    }
    return supabaseJobRepo.jobValueStats()
  },

  async saveGeocode(
    id: string,
    latitude: number,
    longitude: number,
    geocodedAddress: string,
  ): Promise<JobRow | null> {
    await ensureJobInSqlite(id)
    const updated = jobDb.saveGeocode(id, latitude, longitude, geocodedAddress)
    await mirror(updated)
    return updated
  },

  async saveManualLocation(
    id: string,
    latitude: number,
    longitude: number,
  ): Promise<JobRow | null> {
    await ensureJobInSqlite(id)
    const updated = jobDb.saveLocation(id, latitude, longitude, "manual", "manual", null)
    await mirror(updated)
    return updated
  },

  async markLocationNeedsReview(id: string): Promise<JobRow | null> {
    await ensureJobInSqlite(id)
    const updated = jobDb.markLocationNeedsReview(id)
    await mirror(updated)
    return updated
  },
}
