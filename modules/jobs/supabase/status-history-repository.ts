import { createAdminClient } from "@/lib/supabase/admin"
import type { StatusHistoryRow } from "../types/history-types"
import { toStatusHistoryRow, toSupabaseStatusHistoryRow } from "./status-history-mapper"

function table() {
  return createAdminClient().from("status_history")
}

export const supabaseStatusHistoryRepo = {
  async forJob(jobId: string): Promise<StatusHistoryRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("job_id", jobId)
      .order("changed_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toStatusHistoryRow)
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
}
