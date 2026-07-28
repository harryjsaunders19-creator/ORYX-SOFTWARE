/** Recent status-history activity for the dashboard timeline. */

export interface ActivityItem {
  id: string
  jobId: string | null
  drawingNumber: string | null
  fromStatus: string | null
  toStatus: string
  fromLabel: string
  toLabel: string
  changedBy: string
  changedAt: string
  note: string | null
  href: string | null
}

export interface ActivityResponse {
  items: ActivityItem[]
}
