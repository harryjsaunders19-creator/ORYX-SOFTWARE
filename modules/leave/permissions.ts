import type { UserRow } from "@/modules/users/types"
import type { Role } from "@/shared/types/role"
import type { CalendarEventWithDetails } from "@/modules/calendar/types"
import { ANNUAL_LEAVE_CATEGORY_ID } from "./constants"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

export function isAnnualLeaveEvent(event: CalendarEventWithDetails): boolean {
  return event.categoryId === ANNUAL_LEAVE_CATEGORY_ID
}

export function canViewTeamLeave(role: Role): boolean {
  return role === "ADMIN" || role === "ENGINEER"
}

export async function canReviewLeave(viewer: UserRow, targetUserId: string): Promise<boolean> {
  if (viewer.role === "ADMIN") return true
  if (isSupabaseOnly()) {
    const { supabaseEmployeeRepo } = await import("@/modules/employees/supabase/repository")
    return (await supabaseEmployeeRepo.directReportIds(viewer.id)).includes(targetUserId)
  }
  const { employeeProfileDb } = await import("@/lib/db/stores")
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
export async function filterLeaveEventsForViewer(
  viewer: UserRow,
  events: CalendarEventWithDetails[],
  opts: {
    showLeave?: boolean
    hideRejected?: boolean
    leaveStatus?: string
    department?: string
    filterUserId?: string
  },
): Promise<CalendarEventWithDetails[]> {
  let reports: string[]
  let viewerDepartment: string | null = null
  const isAdmin = viewer.role === "ADMIN"
  const needsDeptCheck = !isAdmin && canViewTeamLeave(viewer.role as Role)

  if (isSupabaseOnly()) {
    const { supabaseEmployeeRepo } = await import("@/modules/employees/supabase/repository")
    reports = await supabaseEmployeeRepo.directReportIds(viewer.id)
    if (needsDeptCheck) {
      const profile = await supabaseEmployeeRepo.findProfile(viewer.id)
      viewerDepartment = profile?.department ?? null
    }
  } else {
    const { employeeProfileDb } = await import("@/lib/db/stores")
    reports = employeeProfileDb.directReportIds(viewer.id)
    if (needsDeptCheck) {
      const profile = employeeProfileDb.findUnique(viewer.id)
      viewerDepartment = profile?.department ?? null
    }
  }

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

    if (needsDeptCheck) {
      const leaveStatusNorm = leaveStatus === "APPROVED" || event.status === "LEAVE_APPROVED"
      if (leaveStatusNorm && viewerDepartment && event.employeeDepartment === viewerDepartment) {
        return true
      }
    }

    return false
  })
}
