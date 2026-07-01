import type {
  LeaveCalendarLinkRow,
  LeaveRequestRow,
  LeaveRequestWithMeta,
} from "../types/leave-types"

export interface SupabaseLeaveRequestRow {
  id: string
  user_id: string
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
  status: string
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface SupabaseLeaveCalendarLinkRow {
  leave_request_id: string
  calendar_event_id: string
  user_id: string
  status: string
  created_at: string
  updated_at: string
}

export function toLeaveRequestRow(row: SupabaseLeaveRequestRow): LeaveRequestRow {
  return {
    id: row.id,
    userId: row.user_id,
    leaveType: row.leave_type as LeaveRequestRow["leaveType"],
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status as LeaveRequestRow["status"],
    reviewedBy: row.reviewed_by,
    reviewedByName: row.reviewed_by_name,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseLeaveRequestRow(row: LeaveRequestRow): SupabaseLeaveRequestRow {
  return {
    id: row.id,
    user_id: row.userId,
    leave_type: row.leaveType,
    start_date: row.startDate,
    end_date: row.endDate,
    reason: row.reason,
    status: row.status,
    reviewed_by: row.reviewedBy,
    reviewed_by_name: row.reviewedByName,
    reviewed_at: row.reviewedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toLeaveCalendarLinkRow(row: SupabaseLeaveCalendarLinkRow): LeaveCalendarLinkRow {
  return {
    leaveRequestId: row.leave_request_id,
    calendarEventId: row.calendar_event_id,
    userId: row.user_id,
    status: row.status as LeaveCalendarLinkRow["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseLeaveCalendarLinkRow(row: LeaveCalendarLinkRow): SupabaseLeaveCalendarLinkRow {
  return {
    leave_request_id: row.leaveRequestId,
    calendar_event_id: row.calendarEventId,
    user_id: row.userId,
    status: row.status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toLeaveRequestWithMeta(
  row: LeaveRequestRow,
  meta: {
    userName: string
    department: string | null
    managerId: string | null
    managerName: string | null
    calendarEventId: string | null
  },
): LeaveRequestWithMeta {
  return {
    ...row,
    userName: meta.userName,
    department: meta.department,
    managerId: meta.managerId,
    managerName: meta.managerName,
    calendarEventId: meta.calendarEventId,
  }
}
