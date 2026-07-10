/**
 * Status history during Supabase migration.
 *
 * When SUPABASE_STATUS_HISTORY=true:
 *   - Reads from Supabase
 *   - Writes SQLite first (via historyDb / jobDb side effects), then mirror
 */
import type { StatusHistoryRow } from "../types/history-types"
import { historyDb } from "@/lib/db/stores"
import { useSupabaseStatusHistory, isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { supabaseStatusHistoryRepo } from "../supabase/status-history-repository"
import { supabaseJobRepo } from "../supabase/repository"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"

export const historyService = {
  async forJob(jobId: string): Promise<StatusHistoryRow[]> {
    if (!useSupabaseStatusHistory()) return historyDb.forJob(jobId)
    return supabaseStatusHistoryRepo.forJob(jobId)
  },

  async addNote(jobId: string, note: string, changedBy: string): Promise<StatusHistoryRow> {
    if (isSupabaseOnly()) {
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
    }
    const entry = historyDb.addNote(jobId, note, changedBy)
    if (useSupabaseStatusHistory()) await supabaseStatusHistoryRepo.upsert(entry)
    return entry
  },

  /** Mirror all history rows for a job after jobDb writes. */
  async syncForJob(jobId: string): Promise<void> {
    if (!useSupabaseStatusHistory() || isSupabaseOnly()) return
    const rows = historyDb.forJob(jobId)
    await supabaseStatusHistoryRepo.syncForJob(jobId, rows)
  },

  async deleteForJob(jobId: string): Promise<void> {
    if (useSupabaseStatusHistory()) await supabaseStatusHistoryRepo.deleteForJob(jobId)
  },

  async recentForExport(
    limit = 2000,
  ): Promise<Array<StatusHistoryRow & { drawingNumber: string | null }>> {
    if (!useSupabaseStatusHistory()) return historyDb.recentForExport(limit)
    return supabaseStatusHistoryRepo.recentForExport(limit)
  },
}
