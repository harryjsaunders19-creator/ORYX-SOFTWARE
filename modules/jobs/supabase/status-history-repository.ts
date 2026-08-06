import { createAdminClient } from "@/shared/supabase/admin"
import type { StatusHistoryRow } from "../types/history-types"
import { toStatusHistoryRow, toSupabaseStatusHistoryRow } from "./status-history-mapper"

function table() {
  return createAdminClient().from("status_history")
}

export const supabaseStatusHistoryRepo = {
  async forWorkItem(workItemId: string): Promise<StatusHistoryRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("work_item_id", workItemId)
      .order("changed_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toStatusHistoryRow)
  },

  /** Bulk-fetch status history for many work items — one query instead of N. */
  async forWorkItems(workItemIds: string[]): Promise<Map<string, StatusHistoryRow[]>> {
    const map = new Map<string, StatusHistoryRow[]>()
    if (!workItemIds.length) return map
    for (const id of workItemIds) map.set(id, [])
    const { data, error } = await table()
      .select("*")
      .in("work_item_id", workItemIds)
      .order("changed_at", { ascending: true })
    if (error) throw error
    for (const row of data ?? []) {
      const history = toStatusHistoryRow(row)
      if (!history.workItemId) continue
      const list = map.get(history.workItemId) ?? []
      list.push(history)
      map.set(history.workItemId, list)
    }
    return map
  },

  async forJob(jobId: string): Promise<StatusHistoryRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("job_id", jobId)
      .order("changed_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toStatusHistoryRow)
  },

  /** Bulk-fetch status history for many jobs — one query instead of N. */
  async forJobs(jobIds: string[]): Promise<Map<string, StatusHistoryRow[]>> {
    const map = new Map<string, StatusHistoryRow[]>()
    if (!jobIds.length) return map
    for (const id of jobIds) map.set(id, [])
    const { data, error } = await table()
      .select("*")
      .in("job_id", jobIds)
      .order("changed_at", { ascending: true })
    if (error) throw error
    for (const row of data ?? []) {
      const history = toStatusHistoryRow(row)
      if (!history.jobId) continue
      const list = map.get(history.jobId) ?? []
      list.push(history)
      map.set(history.jobId, list)
    }
    return map
  },

  async upsert(row: StatusHistoryRow): Promise<void> {
    const { error } = await table().upsert(toSupabaseStatusHistoryRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async syncForJob(jobId: string, rows: StatusHistoryRow[]): Promise<void> {
    const { error: delError } = await table().delete().eq("job_id", jobId)
    if (delError) throw delError
    if (!rows.length) return
    const { error } = await table().insert(rows.map(toSupabaseStatusHistoryRow))
    if (error) throw error
  },

  async deleteForJob(jobId: string): Promise<void> {
    const { error } = await table().delete().eq("job_id", jobId)
    if (error) throw error
  },

  async recentForExport(
    limit = 2000,
  ): Promise<Array<StatusHistoryRow & { drawingNumber: string | null }>> {
    const { data, error } = await table()
      .select("id, job_id, from_status, to_status, changed_by, changed_at, note, jobs(drawing_number)")
      .order("changed_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(row => {
      const raw = row.jobs as { drawing_number: string | null } | { drawing_number: string | null }[] | null
      const job = Array.isArray(raw) ? raw[0] : raw
      return {
        id: row.id,
        jobId: row.job_id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        changedBy: row.changed_by,
        changedAt: row.changed_at,
        note: row.note,
        drawingNumber: job?.drawing_number ?? null,
      }
    })
  },
}
