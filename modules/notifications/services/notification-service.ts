/**
 * Aggregates in-app notifications — overdue jobs, due today, clients on hold, pending leave (admins).
 */
import type { UserRow } from "@/lib/db/user-types"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import { leaveTypeLabel } from "@/lib/leave/constants"
import { jobService } from "@/lib/services/job-service"
import { holdService } from "@/lib/services/hold-service"
import { leaveService } from "@/lib/services/leave-service"
import { getDeadlineInfo } from "@/shared/utils/utils"
import {
  sortNotifications,
  type AppNotification,
  type NotificationsPayload,
} from "../types/notifications-types"

const LIMIT = 20

function formatLeaveRange(startDate: string, endDate: string): string {
  const fmt = (d: string) =>
    new Date(d.slice(0, 10)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  const start = fmt(startDate)
  const end = fmt(endDate)
  return start === end ? start : `${start} – ${end}`
}

export const notificationService = {
  async list(viewer: UserRow): Promise<NotificationsPayload> {
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

    if (viewer.role === "ADMIN" && isExperimentalEnabled("leave")) {
      const pendingLeave = await leaveService.findMany(viewer, { status: "PENDING" })
      for (const req of pendingLeave.slice(0, 15)) {
        items.push({
          id: `leave-pending-${req.id}`,
          kind: "leave_pending",
          title: `${req.userName} — leave request`,
          message: `${leaveTypeLabel(req.leaveType)} · ${formatLeaveRange(req.startDate, req.endDate)}${req.reason ? ` · ${req.reason}` : ""}`,
          href: "/calendar",
          at: req.createdAt,
          severity: "warning",
        })
      }
    }

    const notifications = sortNotifications(items).slice(0, LIMIT)
    return {
      notifications,
      unreadCount: notifications.length,
    }
  },
}
