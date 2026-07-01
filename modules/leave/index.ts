/**
 * Leave module — public API.
 * Import from `@/modules/leave` only; do not reach into subfolders.
 */
export { leaveService } from "./services/leave-service"

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

export {
  isAnnualLeaveEvent,
  canViewTeamLeave,
  canReviewLeave,
  canAcceptLeave,
  canFilterAllEmployees,
  filterLeaveEventsForViewer,
} from "./permissions"

export { enrichEventsWithLeave } from "./enrichment"

export type {
  LeaveRequestRow,
  LeaveCalendarLinkRow,
  CreateLeaveRequestData,
  LeaveRequestWithMeta,
} from "./types"

export { supabaseLeaveRepo } from "./supabase/repository"

export {
  LeaveEventDialog,
  isLeaveEvent,
  leaveDisplayColor,
  type LeaveCalendarEvent,
} from "./components/leave-event-dialog"

export { LeaveAcceptancePanel } from "./components/leave-acceptance-panel"
