/**
 * Supabase-only job operations (Vercel / isSupabaseOnly).
 * Never imports SQLite, history-service, billing-handoff-service, archive-log-service, or client-service.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { CreateJobData, JobRow, UpdateJobData } from "../types/job-types"
import type { FindManyOptions, WhereClause } from "@/lib/db/helpers"
import { nowIso } from "@/lib/db/helpers"
import { probeArchivedColumns } from "@/lib/supabase/archived-filter"
import { ensureSequencesSeeded } from "@/lib/supabase/seed-sequences"
import { supabaseArchiveLogRepo } from "@/modules/archive/supabase/repository"
import { supabaseJobRepo } from "../supabase/repository"
import { supabaseStatusHistoryRepo } from "../supabase/status-history-repository"
import { jobSupabaseWrites } from "./job-supabase-writes"

async function logArchive(opts: {
  entityId: string
  entityLabel: string
  action: "archive" | "restore"
  performedBy: string
  performedByName: string
  reason?: string
}): Promise<void> {
  try {
    await supabaseArchiveLogRepo.insert({
      id: nanoid(),
      entityType: "job",
      entityId: opts.entityId,
      entityLabel: opts.entityLabel,
      action: opts.action,
      performedBy: opts.performedBy,
      performedByName: opts.performedByName,
      performedAt: nowIso(),
      reason: opts.reason ?? null,
    })
  } catch (err) {
    console.warn("[jobService] archive log failed:", err)
  }
}

/** Existence check against Supabase (no SQLite sync on this path). */
async function ensureJobInSqlite(id: string): Promise<boolean> {
  const job = await supabaseJobRepo.findUnique(id)
  return job !== null
}

export { ensureJobInSqlite as ensureJobInSqliteForBilling }

export const jobService = {
  ensureJobInSqlite,

  async findManyWithCount(opts: FindManyOptions = {}): Promise<{
    jobs: JobRow[]
    total: number
    allForRevisions?: { id: string; parentJobId: string | null }[]
  }> {
    return supabaseJobRepo.findManyWithCount(opts)
  },

  async findMany(opts: FindManyOptions = {}): Promise<JobRow[]> {
    return supabaseJobRepo.findMany(opts)
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
    return supabaseJobRepo.findAnalyticsFields(opts)
  },

  async count(where: WhereClause = {}): Promise<number> {
    return supabaseJobRepo.count(where)
  },

  async findUnique(id: string): Promise<JobRow | null> {
    return supabaseJobRepo.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<JobRow[]> {
    return supabaseJobRepo.findManyByIds(ids)
  },

  async revisionsForJob(parentId: string): Promise<JobRow[]> {
    return supabaseJobRepo.revisionsForJob(parentId)
  },

  async findLatestRevisionsForParents(parentIds: string[]): Promise<JobRow[]> {
    if (!parentIds.length) return []
    return supabaseJobRepo.findLatestRevisionsForParents(parentIds)
  },

  async create(data: CreateJobData): Promise<JobRow> {
    await ensureSequencesSeeded()
    return jobSupabaseWrites.create(data)
  },

  async update(id: string, data: UpdateJobData): Promise<JobRow | null> {
    return jobSupabaseWrites.update(id, data)
  },

  async assignDesigner(id: string, designer: string, changedBy: string): Promise<{ job: JobRow } | null> {
    return jobSupabaseWrites.assignDesigner(id, designer, changedBy)
  },

  /** SQLite-only helper; no local FK graph on Supabase-only path. */
  deletionBlockers(_id: string): string[] {
    return []
  },

  async archive(id: string, archiverId: string, archiverName: string, reason: string): Promise<JobRow | null> {
    const now = nowIso()
    await probeArchivedColumns()
    const remote = await supabaseJobRepo.findUnique(id)
    if (!remote) return null
    const ok = await supabaseJobRepo.archive(id, archiverId, now)
    if (!ok) return null
    const updated = await supabaseJobRepo.findUnique(id)
    await logArchive({
      entityId: id,
      entityLabel: remote.drawingNumber,
      action: "archive",
      performedBy: archiverId,
      performedByName: archiverName,
      reason,
    })
    return updated
  },

  async restore(id: string, restorerId: string, restorerName: string): Promise<JobRow | null> {
    const now = nowIso()
    const remote = await supabaseJobRepo.findUnique(id)
    if (!remote) return null
    const ok = await supabaseJobRepo.restore(id, now)
    if (!ok) return null
    const updated = await supabaseJobRepo.findUnique(id)
    await logArchive({
      entityId: id,
      entityLabel: remote.drawingNumber,
      action: "restore",
      performedBy: restorerId,
      performedByName: restorerName,
    })
    return updated
  },

  async findArchived(): Promise<JobRow[]> {
    return supabaseJobRepo.findArchived()
  },

  async delete(id: string): Promise<boolean> {
    const ok = await supabaseJobRepo.delete(id)
    if (ok) await supabaseStatusHistoryRepo.deleteForJob(id)
    return ok
  },

  /** No SQLite row to sync — return current Supabase job. */
  async syncFromSqlite(id: string): Promise<JobRow | null> {
    return supabaseJobRepo.findUnique(id)
  },

  async setDrawingNumber(id: string, drawingNumber: string): Promise<JobRow | null> {
    return jobSupabaseWrites.setDrawingNumber(id, drawingNumber)
  },

  distinctDesigners(): string[] {
    return []
  },

  async groupByStatus(): Promise<{ status: string; count: number }[]> {
    return supabaseJobRepo.groupByStatus()
  },

  async groupByItemType(): Promise<{ itemType: string; count: number }[]> {
    return supabaseJobRepo.groupByItemType()
  },

  async findRecent(take: number) {
    return supabaseJobRepo.findRecent(take)
  },

  async findOverduePreview(take = 5) {
    return supabaseJobRepo.findOverduePreview(take)
  },

  async countWhere(where: WhereClause & { createdAfter?: string }): Promise<number> {
    return supabaseJobRepo.count(where)
  },

  async deadlineStats(): Promise<{ overdueCount: number; dueTodayCount: number; dueThisWeekCount: number }> {
    return supabaseJobRepo.deadlineStats()
  },

  async dashboardCounts(): Promise<{
    byStatus: { status: string; count: number }[]
    byItemType: { itemType: string; count: number }[]
    unassigned: number
    totalActiveJobs: number
    totalRevisions: number
    overdueCount: number
    dueTodayCount: number
    dueThisWeekCount: number
  }> {
    return supabaseJobRepo.dashboardCounts()
  },

  async totalQuotedValue(): Promise<number> {
    return (await supabaseJobRepo.jobValueStats()).totalQuotedValue
  },

  async totalIssuedValue(): Promise<number> {
    return (await supabaseJobRepo.jobValueStats()).totalIssuedValue
  },

  async avgJobValue(): Promise<number> {
    return (await supabaseJobRepo.jobValueStats()).avgJobValue
  },

  async jobValueStats(): Promise<{ totalQuotedValue: number; totalIssuedValue: number; avgJobValue: number }> {
    return supabaseJobRepo.jobValueStats()
  },

  async saveGeocode(
    id: string,
    latitude: number,
    longitude: number,
    geocodedAddress: string,
  ): Promise<JobRow | null> {
    const existing = await supabaseJobRepo.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    const updated: JobRow = {
      ...existing,
      latitude,
      longitude,
      geocodedAt: now,
      geocodedAddress,
      locationStatus: "mapped",
      locationSource: "geocoded",
      updatedAt: now,
    }
    await supabaseJobRepo.upsert(updated)
    return updated
  },

  async saveManualLocation(
    id: string,
    latitude: number,
    longitude: number,
  ): Promise<JobRow | null> {
    const existing = await supabaseJobRepo.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    const updated: JobRow = {
      ...existing,
      latitude,
      longitude,
      geocodedAt: now,
      geocodedAddress: null,
      locationStatus: "manual",
      locationSource: "manual",
      updatedAt: now,
    }
    await supabaseJobRepo.upsert(updated)
    return updated
  },

  async markLocationNeedsReview(id: string): Promise<JobRow | null> {
    const existing = await supabaseJobRepo.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    const updated: JobRow = {
      ...existing,
      latitude: null,
      longitude: null,
      geocodedAt: null,
      geocodedAddress: null,
      locationStatus: "needs_review",
      locationSource: null,
      updatedAt: now,
    }
    await supabaseJobRepo.upsert(updated)
    return updated
  },
}
