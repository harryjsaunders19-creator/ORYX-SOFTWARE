import type { StatusHistoryRow } from "@/lib/db/history-types"

export interface SupabaseStatusHistoryRow {
  id: string
  job_id: string
  from_status: string | null
  to_status: string
  changed_by: string
  changed_at: string
  note: string | null
}

export function toStatusHistoryRow(row: SupabaseStatusHistoryRow): StatusHistoryRow {
  return {
    id: row.id,
    jobId: row.job_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    note: row.note,
  }
}

export function toSupabaseStatusHistoryRow(row: StatusHistoryRow): SupabaseStatusHistoryRow {
  return {
    id: row.id,
    job_id: row.jobId,
    from_status: row.fromStatus,
    to_status: row.toStatus,
    changed_by: row.changedBy,
    changed_at: row.changedAt,
    note: row.note,
  }
}
