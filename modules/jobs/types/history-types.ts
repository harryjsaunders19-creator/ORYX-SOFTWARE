/** Shared status history types. */

export interface StatusHistoryRow {
  id: string
  /** Legacy jobs FK — nullable when WORK_ITEMS_MODEL writes work-item-only history. */
  jobId: string | null
  workItemId?: string | null
  fromStatus: string | null
  toStatus: string
  changedBy: string
  changedAt: string
  note: string | null
}
