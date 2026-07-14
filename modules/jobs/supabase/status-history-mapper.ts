import type { StatusHistoryRow } from "../types/history-types"

export interface SupabaseStatusHistoryRow {
  id: string
  job_id: string | null
  work_item_id?: string | null
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
    workItemId: row.work_item_id ?? null,
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
    work_item_id: row.workItemId ?? null,
    from_status: row.fromStatus,
    to_status: row.toStatus,
    changed_by: row.changedBy,
    changed_at: row.changedAt,
    note: row.note,
  }
}
