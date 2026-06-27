/** Shared status history types. */

export interface StatusHistoryRow {
  id: string
  jobId: string
  fromStatus: string | null
  toStatus: string
  changedBy: string
  changedAt: string
  note: string | null
}
