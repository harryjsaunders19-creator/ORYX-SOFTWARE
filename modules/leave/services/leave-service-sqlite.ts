/**
 * Leave service — SQLite path for local/CI when Supabase admin is not configured.
 * No Supabase imports, no mirror calls.
 */
import { createId } from "@paralleldrive/cuid2"
import type { UserRow } from "@/modules/users/types"
import type { LeaveRequestRow, LeaveRequestWithMeta } from "../types/leave-types"
import { leaveDb, employeeProfileDb } from "@/lib/db/stores"
import { calendarService } from "@/modules/calendar"
import { userService } from "@/modules/users"
import {
  ANNUAL_LEAVE_CATEGORY_ID,
  countLeaveDays,
  leaveRequestToCalendarStatus,
  type LeaveRequestStatus,
  type LeaveType,
} from "../constants"
import { canAcceptLeave, canReviewLeave } from "../permissions"
import { SHOW_PENDING_ON_CREATE, toAllDayRange, buildEventTitle } from "./leave-helpers"
import { hasFullAccess } from "@/shared/auth/permissions"

async function ensureEmployeeProfile(userId: string) {
  return employeeProfileDb.ensure(userId)
}

async function recalcLeaveTaken(userId: string): Promise<void> {
  const year = new Date().getFullYear()
  const approved = leaveDb.findMany({ userId, status: "APPROVED" })
  const days = approved
    .filter(r => r.startDate.slice(0, 4) <= String(year) && r.endDate.slice(0, 4) >= String(year))
    .reduce((sum, r) => sum + countLeaveDays(r.startDate, r.endDate), 0)
  employeeProfileDb.update(userId, { leaveTaken: days })
}

async function syncLeaveToCalendar(request: LeaveRequestRow, actorUserId: string): Promise<void> {
  const user = await userService.findUnique(request.userId)
  if (!user) return

  const link = leaveDb.getLinkByLeaveId(request.id)

  if (request.status === "REJECTED" || request.status === "CANCELLED") {
    if (link) {
      await calendarService.delete(link.calendarEventId)
      leaveDb.deleteLink(request.id)
    }
    await recalcLeaveTaken(request.userId)
    return
  }

  if (request.status === "PENDING" && !SHOW_PENDING_ON_CREATE) return

  const range = toAllDayRange(request.startDate, request.endDate)
  const payload = {
    title: buildEventTitle(user.name, request.leaveType),
    categoryId: ANNUAL_LEAVE_CATEGORY_ID,
    ...range,
    allDay: 1 as const,
    description: request.reason,
    status: leaveRequestToCalendarStatus(request.status),
  }

  if (link) {
    await calendarService.update(link.calendarEventId, payload, [request.userId])
    leaveDb.upsertLink(request.id, link.calendarEventId, request.userId, request.status)
  } else {
    const eventId = createId()
    await calendarService.create(
      { id: eventId, ...payload, createdBy: actorUserId },
      [request.userId],
    )
    leaveDb.upsertLink(request.id, eventId, request.userId, request.status)
  }

  if (request.status === "APPROVED") await recalcLeaveTaken(request.userId)
}

export const leaveService = {
  async findMany(viewer: UserRow, opts: {
    userId?: string
    status?: LeaveRequestStatus
    from?: string
    to?: string
  }): Promise<LeaveRequestWithMeta[]> {
    const rows = leaveDb.findMany(opts)
    if (hasFullAccess(viewer.role)) return rows
    const reports = employeeProfileDb.directReportIds(viewer.id)
    return rows.filter(r => r.userId === viewer.id || reports.includes(r.userId))
  },

  async findApprovedInRange(from: string, to: string): Promise<LeaveRequestWithMeta[]> {
    return leaveDb.findMany({ status: "APPROVED", from, to })
  },

  async createRequest(
    actor: UserRow,
    data: {
      userId?: string
      leaveType?: LeaveType
      startDate: string
      endDate: string
      reason?: string | null
    },
  ): Promise<LeaveRequestWithMeta | null> {
    const userId = data.userId ?? actor.id
    if (userId !== actor.id && !hasFullAccess(actor.role) && !(await canReviewLeave(actor, userId))) {
      return null
    }

    const start = data.startDate.slice(0, 10)
    const end = data.endDate.slice(0, 10)
    if (end < start) throw new Error("End date must be on or after start date")

    await ensureEmployeeProfile(userId)
    const id = createId()
    const row = leaveDb.create({
      id,
      userId,
      leaveType: data.leaveType ?? "ANNUAL_LEAVE",
      startDate: start,
      endDate: end,
      reason: data.reason,
    })
    await syncLeaveToCalendar(row, actor.id)
    return leaveDb.findMany({ userId }).find(r => r.id === id) ?? null
  },

  async reviewRequest(
    reviewer: UserRow,
    requestId: string,
    status: "APPROVED" | "REJECTED",
  ): Promise<LeaveRequestWithMeta | null> {
    const existing = leaveDb.findUnique(requestId)
    if (!existing) return null
    if (!canAcceptLeave(reviewer)) return null
    if (existing.status !== "PENDING") return null

    const updated = leaveDb.updateStatus(requestId, status, { id: reviewer.id, name: reviewer.name })
    if (!updated) return null
    await syncLeaveToCalendar(updated, reviewer.id)
    return leaveDb.findMany({ userId: updated.userId }).find(r => r.id === requestId) ?? null
  },

  async updateRequest(
    actor: UserRow,
    requestId: string,
    data: { startDate?: string; endDate?: string; reason?: string | null },
  ): Promise<LeaveRequestWithMeta | null> {
    const existing = leaveDb.findUnique(requestId)
    if (!existing) return null
    const canEdit = existing.userId === actor.id || (await canReviewLeave(actor, existing.userId))
    if (!canEdit) return null
    if (existing.status === "CANCELLED" || existing.status === "REJECTED") return null

    const start = (data.startDate ?? existing.startDate).slice(0, 10)
    const end = (data.endDate ?? existing.endDate).slice(0, 10)
    if (end < start) throw new Error("End date must be on or after start date")

    const updated = leaveDb.updateDates(requestId, start, end, data.reason !== undefined ? data.reason : existing.reason)
    if (!updated) return null
    await syncLeaveToCalendar(updated, actor.id)
    return leaveDb.findMany({ userId: updated.userId }).find(r => r.id === requestId) ?? null
  },

  async cancelRequest(actor: UserRow, requestId: string): Promise<boolean> {
    const existing = leaveDb.findUnique(requestId)
    if (!existing) return false
    if (existing.userId !== actor.id && !(await canReviewLeave(actor, existing.userId))) return false
    if (existing.status === "CANCELLED" || existing.status === "REJECTED") return false

    const cancelled = leaveDb.cancel(requestId)
    if (!cancelled) return false
    await syncLeaveToCalendar(cancelled, actor.id)
    return true
  },

  async getLeaveSummaryForUser(userId: string) {
    const profile = await ensureEmployeeProfile(userId)
    const now = new Date().toISOString().slice(0, 10)
    const requests = leaveDb.findMany({ userId })
    const upcoming = requests
      .filter(r => r.endDate >= now && (r.status === "APPROVED" || r.status === "PENDING"))
      .slice(0, 10)
      .map(r => ({
        id: r.id,
        title: buildEventTitle(r.userName, r.leaveType),
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
      }))
    const history = requests
      .filter(r => r.endDate < now && r.status === "APPROVED")
      .slice(0, 10)
      .map(r => ({
        id: r.id,
        title: buildEventTitle(r.userName, r.leaveType),
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
      }))
    return {
      annualLeaveAllowance: profile.annualLeaveAllowance,
      leaveTaken: profile.leaveTaken,
      remaining: Math.max(0, profile.annualLeaveAllowance - profile.leaveTaken),
      upcoming,
      history,
    }
  },
}
