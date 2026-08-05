/**
 * Calendar module — public API.
 * Import from `@/modules/calendar` only; do not reach into subfolders.
 */
export { calendarService } from "./services/calendar-service"

export {
  CALENDAR_USER_CATEGORY_IDS,
  LEAVE_CATEGORY_IDS,
  isUserSelectableCategory,
  isLeaveCategory,
  filterUserCategories,
  resolveCategoryFilter,
  type CalendarUserCategoryId,
} from "./config/category-config"

export type {
  EventCategoryRow,
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  UpdateCalendarEventData,
  CalendarEventListOptions,
} from "./types"

export { supabaseCalendarRepo } from "./supabase/repository"

export { MonthView } from "./components/month-view"
export { WeekView } from "./components/week-view"
export { AgendaView } from "./components/agenda-view"
export { EventDialog } from "./components/event-dialog"
export { EventPill } from "./components/event-pill"
export { default as CalendarPage } from "./components/calendar-page"

/** Site visit category id — used by dashboard and export. */
export const SITE_VISIT_CATEGORY_ID = "cat_site_visit"
export const TEAMS_MEETING_CATEGORY_ID = "cat_teams_meeting"

export {
  getCalendarRange,
  resolveEventDisplayColour,
  type CalendarViewMode,
} from "./lib/calendar-display"

export {
  isJobDerivedEventId,
  jobIdFromDerivedEventId,
} from "./lib/job-derived-ids"
