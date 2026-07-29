/**
 * Status history — Supabase-only path (Vercel / isSupabaseOnly).
 */
import type { StatusHistoryRow } from "../types/history-types"
import { supabaseStatusHistoryRepo } from "../supabase/status-history-repository"
import { supabaseJobRepo } from "../supabase/repository"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"

export const historyService = {
  async forJob(jobId: string): Promise<StatusHistoryRow[]> {
    return supabaseStatusHistoryRepo.forJob(jobId)
  },

  async addNote(jobId: string, note: string, changedBy: string): Promise<StatusHistoryRow> {
    const job = await supabaseJobRepo.findUnique(jobId)
    const entry: StatusHistoryRow = {
      id: nanoid(),
      jobId,
      fromStatus: job?.status ?? null,
      toStatus: job?.status ?? "",
      changedBy,
      changedAt: nowIso(),
      note,
    }
    await supabaseStatusHistoryRepo.upsert(entry)
    return entry
  },

  async syncForJob(_jobId: string): Promise<void> {
    return
  },

  async deleteForJob(jobId: string): Promise<void> {
    await supabaseStatusHistoryRepo.deleteForJob(jobId)
  },

  async recentForExport(
    limit = 2000,
  ): Promise<Array<StatusHistoryRow & { drawingNumber: string | null }>> {
    return supabaseStatusHistoryRepo.recentForExport(limit)
  },

  async issuedByForJobs(
    jobIds: string[],
  ): Promise<Map<string, { changedBy: string; changedAt: string }>> {
    const map = new Map<string, { changedBy: string; changedAt: string }>()
    if (!jobIds.length) return map
    const byJob = await supabaseStatusHistoryRepo.forJobs(jobIds)
    for (const [jobId, rows] of byJob) {
      const issued = rows.find(r => r.toStatus === "ISSUED")
      if (issued) map.set(jobId, { changedBy: issued.changedBy, changedAt: issued.changedAt })
    }
    return map
  },
}
