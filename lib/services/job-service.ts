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
import type { CreateJobData, JobRow, UpdateJobData } from "@/lib/db/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { jobDb, commercialDb } from "@/lib/db/stores"
import { useSupabaseJobs } from "@/lib/supabase/feature-flags"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { historyService } from "@/lib/services/history-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"

async function mirror(job: JobRow | null) {
  if (job && useSupabaseJobs()) await supabaseJobRepo.upsert(job)
}

async function mirrorHistory(jobId: string) {
  await historyService.syncForJob(jobId)
  await billingHandoffService.syncJobHandoffs(jobId)
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
  jobDb.rawInsertOrIgnore(job)
  return true
}

export const jobService = {
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
    // If this is a revision, its parentJobId must exist in SQLite for FK constraints.
    if (data.parentJobId) await ensureJobInSqlite(data.parentJobId)
    const job = jobDb.create(data)
    await mirror(job)
    await mirrorHistory(job.id)
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

  async totalQuotedValue(): Promise<number> {
    if (!useSupabaseJobs()) return commercialDb.totalQuotedValue()
    return supabaseJobRepo.totalQuotedValue()
  },

  async totalIssuedValue(): Promise<number> {
    if (!useSupabaseJobs()) return commercialDb.totalIssuedValue()
    return supabaseJobRepo.totalIssuedValue()
  },

  async avgJobValue(): Promise<number> {
    if (!useSupabaseJobs()) return commercialDb.avgJobValue()
    return supabaseJobRepo.avgJobValue()
  },
}
