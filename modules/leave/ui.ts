/**
 * Leave module — client-safe public API.
 * Use this entry from Client Components; `@/modules/leave` is server-only (services, DB).
 */
export {
  LeaveEventDialog,
  isLeaveEvent,
  leaveDisplayColor,
  type LeaveCalendarEvent,
} from "./components/leave-event-dialog"

export { LeaveAcceptancePanel } from "./components/leave-acceptance-panel"

export {
  ANNUAL_LEAVE_CATEGORY_ID,
  LEAVE_REQUEST_STATUSES,
  LEAVE_TYPES,
  CALENDAR_LEAVE_STATUSES,
  LEAVE_STATUS_COLORS,
  leaveRequestToCalendarStatus,
  calendarStatusToLeaveRequest,
  leaveTypeLabel,
  countLeaveDays,
  type LeaveRequestStatus,
  type LeaveType,
  type CalendarLeaveStatus,
} from "./constants"
