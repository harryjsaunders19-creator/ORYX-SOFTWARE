import type { UserRow } from "@/modules/users/types"
import type { Role } from "@/shared/types/role"
import type { CalendarEventWithDetails } from "@/modules/calendar/types"
import { ANNUAL_LEAVE_CATEGORY_ID } from "./constants"
import { employeeProfileDb } from "@/lib/db/stores"

export function isAnnualLeaveEvent(event: CalendarEventWithDetails): boolean {
  return event.categoryId === ANNUAL_LEAVE_CATEGORY_ID
}

export function canViewTeamLeave(role: Role): boolean {
  return role === "ADMIN" || role === "ENGINEER"
}

export function canReviewLeave(viewer: UserRow, targetUserId: string): boolean {
  if (viewer.role === "ADMIN") return true
  return employeeProfileDb.directReportIds(viewer.id).includes(targetUserId)
}

/** Accept or reject leave requests — admins only. */
export function canAcceptLeave(viewer: UserRow): boolean {
  return viewer.role === "ADMIN"
}

export function canFilterAllEmployees(role: Role, directReportIds: string[]): boolean {
  return role === "ADMIN" || directReportIds.length > 0
}

/** Filter calendar events for leave visibility based on role and filters. */
export function filterLeaveEventsForViewer(
  viewer: UserRow,
  events: CalendarEventWithDetails[],
  opts: {
    showLeave?: boolean
    hideRejected?: boolean
    leaveStatus?: string
    department?: string
    filterUserId?: string
  },
): CalendarEventWithDetails[] {
  const reports = employeeProfileDb.directReportIds(viewer.id)
  const isAdmin = viewer.role === "ADMIN"

  return events.filter(event => {
    if (!isAnnualLeaveEvent(event)) return true
    if (opts.showLeave === false) return false

    const assigneeId = event.assignees[0]?.userId ?? event.leaveUserId
    const leaveStatus = event.leaveReviewStatus ?? event.status

    if (opts.hideRejected !== false && (leaveStatus === "REJECTED" || event.status === "LEAVE_REJECTED")) {
      return false
    }

    if (opts.leaveStatus && leaveStatus !== opts.leaveStatus && event.status !== `LEAVE_${opts.leaveStatus}`) {
      return false
    }

    if (opts.filterUserId && assigneeId !== opts.filterUserId) return false

    if (opts.department && event.employeeDepartment !== opts.department) return false

    if (isAdmin) return true
    if (assigneeId === viewer.id) return true
    if (reports.includes(assigneeId ?? "")) return true

    if (canViewTeamLeave(viewer.role as Role)) {
      const viewerProfile = employeeProfileDb.findUnique(viewer.id)
      const leaveStatusNorm = leaveStatus === "APPROVED" || event.status === "LEAVE_APPROVED"
      if (leaveStatusNorm && viewerProfile?.department && event.employeeDepartment === viewerProfile.department) {
        return true
      }
    }

    return false
  })
}
