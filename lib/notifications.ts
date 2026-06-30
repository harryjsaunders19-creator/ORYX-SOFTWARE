/** In-app notification items for the top-bar bell. */

export type NotificationKind = "job_overdue" | "job_due_today" | "client_on_hold" | "leave_pending"

export type NotificationSeverity = "danger" | "warning"

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  message: string
  href: string
  at: string
  severity: NotificationSeverity
}

export interface NotificationsPayload {
  notifications: AppNotification[]
  unreadCount: number
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  danger: 0,
  warning: 1,
}

export function sortNotifications(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => {
    const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (sr !== 0) return sr
    return b.at.localeCompare(a.at)
  })
}
