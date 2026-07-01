/**
 * Notifications module — public API.
 * Import from `@/modules/notifications` only; do not reach into subfolders.
 */
export { notificationService } from "./services/notification-service"

export type {
  NotificationKind,
  NotificationSeverity,
  AppNotification,
  NotificationsPayload,
} from "./types"

export { sortNotifications } from "./types/notifications-types"

export { NotificationsMenu } from "./components/notifications-menu"
