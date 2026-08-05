/**
 * Leave service — Supabase-only path (Vercel / isSupabaseOnly).
 * No SQLite imports (leaveDb, employeeProfileDb, db connection).
 */
import { createId } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import type { UserRow } from "@/modules/users/types"
import type { EmployeeProfileRow } from "@/modules/employees/types/employee-types"
import type { LeaveRequestRow, LeaveRequestWithMeta } from "../types/leave-types"
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
import { supabaseLeaveRepo } from "../supabase/repository"
import { supabaseEmployeeRepo } from "@/modules/employees/supabase/repository"
import { SHOW_PENDING_ON_CREATE, toAllDayRange, buildEventTitle } from "./leave-helpers"
import { hasFullAccess } from "@/shared/auth/permissions"

async function ensureEmployeeProfile(userId: string): Promise<EmployeeProfileRow> {
  const existing = await supabaseEmployeeRepo.findProfile(userId)
  if (existing) return existing
  const now = nowIso()
  const profile: EmployeeProfileRow = {
    userId,
    employeeId: null,
    profilePhotoPath: null,
    firstName: null,
    lastName: null,
    preferredName: null,
    phone: null,
    mobile: null,
    dateOfBirth: null,
    gender: null,
    nationality: null,
    address: null,
    city: null,
    county: null,
    postcode: null,
    country: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    emergencyContactRelationship: null,
    jobTitle: null,
    department: null,
    managerId: null,
    officeLocation: null,
    employmentType: "FULL_TIME",
    employmentStatus: "ACTIVE",
    startDate: null,
    endDate: null,
    probationEndDate: null,
    workingHours: null,
    salary: null,
    annualLeaveAllowance: 25,
    leaveTaken: 0,
    createdAt: now,
    updatedAt: now,
  }
  await supabaseEmployeeRepo.upsertProfile(profile)
  return profile
}

async function recalcLeaveTaken(userId: string): Promise<void> {
  const year = new Date().getFullYear()
  const approved = await supabaseLeaveRepo.findMany({ userId, status: "APPROVED" })
  const days = approved
    .filter(r => r.startDate.slice(0, 4) <= String(year) && r.endDate.slice(0, 4) >= String(year))
    .reduce((sum, r) => sum + countLeaveDays(r.startDate, r.endDate), 0)
  const existing = await supabaseEmployeeRepo.findProfile(userId)
  if (!existing) return
  await supabaseEmployeeRepo.upsertProfile({ ...existing, leaveTaken: days, updatedAt: nowIso() })
}

async function syncLeaveToCalendar(request: LeaveRequestRow, actorUserId: string): Promise<void> {
  const user = await userService.findUnique(request.userId)
  if (!user) return

  const link = await supabaseLeaveRepo.getLinkByLeaveId(request.id)

  if (request.status === "REJECTED" || request.status === "CANCELLED") {
    if (link) {
      await calendarService.delete(link.calendarEventId)
      await supabaseLeaveRepo.deleteLink(request.id)
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
    await supabaseLeaveRepo.upsertLink({
      leaveRequestId: request.id,
      calendarEventId: link.calendarEventId,
      userId: request.userId,
      status: request.status,
      createdAt: link.createdAt,
      updatedAt: nowIso(),
    })
  } else {
    const eventId = createId()
    await calendarService.create(
      { id: eventId, ...payload, createdBy: actorUserId },
      [request.userId],
    )
    const now = nowIso()
    await supabaseLeaveRepo.upsertLink({
      leaveRequestId: request.id,
      calendarEventId: eventId,
      userId: request.userId,
      status: request.status,
      createdAt: now,
      updatedAt: now,
    })
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
    const rows = await supabaseLeaveRepo.findMany(opts)
    if (hasFullAccess(viewer.role)) return rows
    const reports = await supabaseEmployeeRepo.directReportIds(viewer.id)
    return rows.filter(r => r.userId === viewer.id || reports.includes(r.userId))
  },

  async findApprovedInRange(from: string, to: string): Promise<LeaveRequestWithMeta[]> {
    return supabaseLeaveRepo.findMany({ status: "APPROVED", from, to })
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
    const now = nowIso()
    const row: LeaveRequestRow = {
      id,
      userId,
      leaveType: data.leaveType ?? "ANNUAL_LEAVE",
      startDate: start,
      endDate: end,
      reason: data.reason ?? null,
      status: "PENDING",
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await supabaseLeaveRepo.upsertRequest(row)
    await syncLeaveToCalendar(row, actor.id)
    const all = await supabaseLeaveRepo.findMany({ userId })
    return all.find(r => r.id === id) ?? null
  },

  async reviewRequest(
    reviewer: UserRow,
    requestId: string,
    status: "APPROVED" | "REJECTED",
  ): Promise<LeaveRequestWithMeta | null> {
    const existing = await supabaseLeaveRepo.findUnique(requestId)
    if (!existing) return null
    if (!canAcceptLeave(reviewer)) return null
    if (existing.status !== "PENDING") return null

    const now = nowIso()
    const updated: LeaveRequestRow = {
      ...existing,
      status,
      reviewedBy: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      updatedAt: now,
    }
    await supabaseLeaveRepo.upsertRequest(updated)
    await syncLeaveToCalendar(updated, reviewer.id)
    const all = await supabaseLeaveRepo.findMany({ userId: updated.userId })
    return all.find(r => r.id === requestId) ?? null
  },

  async updateRequest(
    actor: UserRow,
    requestId: string,
    data: { startDate?: string; endDate?: string; reason?: string | null },
  ): Promise<LeaveRequestWithMeta | null> {
    const existing = await supabaseLeaveRepo.findUnique(requestId)
    if (!existing) return null
    const canEdit = existing.userId === actor.id || (await canReviewLeave(actor, existing.userId))
    if (!canEdit) return null
    if (existing.status === "CANCELLED" || existing.status === "REJECTED") return null

    const start = (data.startDate ?? existing.startDate).slice(0, 10)
    const end = (data.endDate ?? existing.endDate).slice(0, 10)
    if (end < start) throw new Error("End date must be on or after start date")

    const updated: LeaveRequestRow = {
      ...existing,
      startDate: start,
      endDate: end,
      reason: data.reason !== undefined ? data.reason : existing.reason,
      updatedAt: nowIso(),
    }
    await supabaseLeaveRepo.upsertRequest(updated)
    await syncLeaveToCalendar(updated, actor.id)
    const all = await supabaseLeaveRepo.findMany({ userId: updated.userId })
    return all.find(r => r.id === requestId) ?? null
  },

  async cancelRequest(actor: UserRow, requestId: string): Promise<boolean> {
    const existing = await supabaseLeaveRepo.findUnique(requestId)
    if (!existing) return false
    if (existing.userId !== actor.id && !(await canReviewLeave(actor, existing.userId))) return false
    if (existing.status === "CANCELLED" || existing.status === "REJECTED") return false

    const cancelled: LeaveRequestRow = {
      ...existing,
      status: "CANCELLED",
      updatedAt: nowIso(),
    }
    await supabaseLeaveRepo.upsertRequest(cancelled)
    await syncLeaveToCalendar(cancelled, actor.id)
    return true
  },

  async getLeaveSummaryForUser(userId: string) {
    const profile = await ensureEmployeeProfile(userId)
    const now = new Date().toISOString().slice(0, 10)
    const requests = await supabaseLeaveRepo.findMany({ userId })
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
