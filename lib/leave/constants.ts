/** Annual leave ↔ calendar integration constants. */

export const ANNUAL_LEAVE_CATEGORY_ID = "cat_annual_leave"

export const LEAVE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number]

export const LEAVE_TYPES = ["ANNUAL_LEAVE", "SICK_LEAVE", "OTHER"] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

/** Stored on CalendarEvent.status for annual-leave category events. */
export const CALENDAR_LEAVE_STATUSES = ["LEAVE_APPROVED", "LEAVE_PENDING", "LEAVE_REJECTED"] as const
export type CalendarLeaveStatus = (typeof CALENDAR_LEAVE_STATUSES)[number]

export const LEAVE_STATUS_COLORS: Record<string, string> = {
  LEAVE_APPROVED: "#15803D",
  LEAVE_PENDING: "#CA8A04",
  LEAVE_REJECTED: "#71717A",
  APPROVED: "#15803D",
  PENDING: "#CA8A04",
}

export function leaveRequestToCalendarStatus(status: LeaveRequestStatus): CalendarLeaveStatus {
  if (status === "APPROVED") return "LEAVE_APPROVED"
  if (status === "PENDING") return "LEAVE_PENDING"
  return "LEAVE_REJECTED"
}

export function calendarStatusToLeaveRequest(status: string): LeaveRequestStatus | null {
  if (status === "LEAVE_APPROVED") return "APPROVED"
  if (status === "LEAVE_PENDING") return "PENDING"
  if (status === "LEAVE_REJECTED") return "REJECTED"
  return null
}

export function leaveTypeLabel(type: string): string {
  if (type === "ANNUAL_LEAVE") return "Annual Leave"
  if (type === "SICK_LEAVE") return "Sick Leave"
  return "Leave"
}

export function countLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate.slice(0, 10))
  const end = new Date(endDate.slice(0, 10))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.floor(ms / 86_400_000) + 1)
}
