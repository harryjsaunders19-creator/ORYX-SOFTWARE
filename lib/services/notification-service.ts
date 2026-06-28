/**
 * Aggregates in-app notifications — overdue jobs, due today, clients on hold only.
 */
import { jobService } from "@/lib/services/job-service"
import { holdService } from "@/lib/services/hold-service"
import { getDeadlineInfo } from "@/lib/utils"
import {
  sortNotifications,
  type AppNotification,
  type NotificationsPayload,
} from "@/lib/notifications"

const LIMIT = 20

export const notificationService = {
  async list(): Promise<NotificationsPayload> {
    // Fetch jobs that are overdue OR due today in a single query, then split
    // in JS — replaces two separate Supabase round trips with one.
    const today = new Date().toISOString().split("T")[0]
    const [deadlineJobs, holds] = await Promise.all([
      jobService.findMany({
        where: { overdueOrDueToday: true },
        orderBy: { field: "requiredByDate", dir: "asc" },
        take: 20,
      }),
      holdService.allActive(),
    ])
    const overdueJobs  = deadlineJobs.filter(j => j.requiredByDate != null && j.requiredByDate < today)
    const dueTodayJobs = deadlineJobs.filter(j => j.requiredByDate === today)

    const items: AppNotification[] = []

    for (const job of overdueJobs) {
      const dl = getDeadlineInfo(job.requiredByDate)
      items.push({
        id: `overdue-${job.id}`,
        kind: "job_overdue",
        title: job.drawingNumber,
        message: `${dl.label} · ${job.address}`,
        href: `/jobs/${job.id}`,
        at: job.updatedAt,
        severity: "danger",
      })
    }

    for (const job of dueTodayJobs) {
      items.push({
        id: `due-today-${job.id}`,
        kind: "job_due_today",
        title: job.drawingNumber,
        message: `Due today · ${job.address}`,
        href: `/jobs/${job.id}`,
        at: job.requiredByDate ?? job.updatedAt,
        severity: "warning",
      })
    }

    for (const hold of holds) {
      items.push({
        id: `hold-${hold.id}`,
        kind: "client_on_hold",
        title: hold.clientName,
        message: hold.reason,
        href: `/clients/${hold.clientId}`,
        at: hold.addedAt,
        severity: "warning",
      })
    }

    const notifications = sortNotifications(items).slice(0, LIMIT)
    return {
      notifications,
      unreadCount: notifications.length,
    }
  },
}
