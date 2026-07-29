/**
 * Status history — SQLite path for local/CI when Supabase admin is not configured.
 * Dual-write was removed; see docs/sqlite-sunset.md.
 */
import type { StatusHistoryRow } from "../types/history-types"
import { historyDb } from "@/lib/db/stores"

export const historyService = {
  async forJob(jobId: string): Promise<StatusHistoryRow[]> {
    return historyDb.forJob(jobId)
  },

  async addNote(jobId: string, note: string, changedBy: string): Promise<StatusHistoryRow> {
    return historyDb.addNote(jobId, note, changedBy)
  },

  /** No-op — dual-write mirror removed; SQLite is already the source. */
  async syncForJob(_jobId: string): Promise<void> {
    return
  },

  /** Cascade from Job FK handles SQLite rows; kept for API symmetry. */
  async deleteForJob(_jobId: string): Promise<void> {
    return
  },

  async recentForExport(
    limit = 2000,
  ): Promise<Array<StatusHistoryRow & { drawingNumber: string | null }>> {
    return historyDb.recentForExport(limit)
  },

  async issuedByForJobs(
    jobIds: string[],
  ): Promise<Map<string, { changedBy: string; changedAt: string }>> {
    const map = new Map<string, { changedBy: string; changedAt: string }>()
    for (const jobId of jobIds) {
      const issued = historyDb.forJob(jobId).find(r => r.toStatus === "ISSUED")
      if (issued) map.set(jobId, { changedBy: issued.changedBy, changedAt: issued.changedAt })
    }
    return map
  },
}
