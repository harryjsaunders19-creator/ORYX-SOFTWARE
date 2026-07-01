import type { LeaveRequestStatus, LeaveType } from "../constants"

export interface LeaveRequestRow {
  id: string
  userId: string
  leaveType: LeaveType
  startDate: string
  endDate: string
  reason: string | null
  status: LeaveRequestStatus
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LeaveCalendarLinkRow {
  leaveRequestId: string
  calendarEventId: string
  userId: string
  status: LeaveRequestStatus
  createdAt: string
  updatedAt: string
}

export interface CreateLeaveRequestData {
  id: string
  userId: string
  leaveType?: LeaveType
  startDate: string
  endDate: string
  reason?: string | null
}

export interface LeaveRequestWithMeta extends LeaveRequestRow {
  userName: string
  department: string | null
  managerId: string | null
  managerName: string | null
  calendarEventId: string | null
}
