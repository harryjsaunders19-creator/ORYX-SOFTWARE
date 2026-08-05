import type { EventCategoryRow } from "../types/calendar-types"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import { ANNUAL_LEAVE_CATEGORY_ID } from "@/modules/leave/constants"

/**
 * Categories shown in calendar filters, legend, and the new-event dialog.
 * Colours are muted consultancy tones (not saturated primaries).
 */
export const CALENDAR_USER_CATEGORY_IDS = [
  "cat_site_visit",
  "cat_client_meeting",
  "cat_teams_meeting",
  "cat_internal_meeting",
  ...(isExperimentalEnabled("leave") ? (["cat_leave"] as const) : []),
] as const

export type CalendarUserCategoryId = (typeof CALENDAR_USER_CATEGORY_IDS)[number]

/** Leave events — manual (`cat_leave`) and synced leave requests (`cat_annual_leave`). */
export const LEAVE_CATEGORY_IDS = ["cat_leave", ANNUAL_LEAVE_CATEGORY_ID] as const

/** Muted professional palette for operations calendar. */
export const CATEGORY_COLOUR_DEFAULTS: Record<string, { name: string; color: string }> = {
  cat_site_visit:       { name: "Site Visit",        color: "#3B6F9A" }, // muted blue
  cat_client_meeting:   { name: "Client Meeting",    color: "#6B5B95" }, // muted purple
  cat_teams_meeting:    { name: "Meeting",           color: "#5B6B8A" }, // slate-purple
  cat_internal_meeting: { name: "Internal Meeting",  color: "#4A6B7C" }, // petrol
  cat_leave:            { name: "Leave",             color: "#6B7280" }, // neutral grey
  cat_survey:           { name: "Survey",            color: "#6B7340" },
  cat_installation:     { name: "Installation",      color: "#3D7A55" },
  cat_completed:        { name: "Completed",         color: "#3D7A55" }, // muted green
  cat_overdue:          { name: "Urgent / Overdue",  color: "#A8483E" }, // muted red
}

/** Compact legend entries for the calendar toolbar. */
export const CALENDAR_LEGEND_ITEMS: { id: string; label: string; color: string }[] = [
  { id: "cat_site_visit", label: "Site Visit", color: CATEGORY_COLOUR_DEFAULTS.cat_site_visit.color },
  { id: "cat_client_meeting", label: "Meeting", color: CATEGORY_COLOUR_DEFAULTS.cat_client_meeting.color },
  { id: "cat_leave", label: "Leave", color: CATEGORY_COLOUR_DEFAULTS.cat_leave.color },
]

export function isUserSelectableCategory(id: string): boolean {
  return (CALENDAR_USER_CATEGORY_IDS as readonly string[]).includes(id)
}

export function isLeaveCategory(id: string): boolean {
  if (!isExperimentalEnabled("leave")) return false
  return (LEAVE_CATEGORY_IDS as readonly string[]).includes(id)
}

export function filterUserCategories(all: EventCategoryRow[]): EventCategoryRow[] {
  return CALENDAR_USER_CATEGORY_IDS.map(id => {
    const row = all.find(c => c.id === id)
    const def = CATEGORY_COLOUR_DEFAULTS[id]
    if (!def) return row ?? { id, name: id, color: "#6B7280", icon: null }
    // Prefer app palette over legacy saturated DB seed colours.
    return {
      id,
      name: row?.name && row.name !== def.name ? row.name : def.name,
      color: def.color,
      icon: row?.icon ?? null,
    }
  })
}

export function resolveCategoryFilter(categoryId?: string | null): {
  categoryId?: string
  categoryIds?: string[]
} {
  if (!categoryId || categoryId === "ALL") return {}
  if (categoryId === "cat_leave" && isExperimentalEnabled("leave")) {
    return { categoryIds: [...LEAVE_CATEGORY_IDS] }
  }
  // Meetings filter groups client + teams + internal
  if (
    categoryId === "cat_teams_meeting"
    || categoryId === "cat_client_meeting"
    || categoryId === "cat_internal_meeting"
  ) {
    return {
      categoryIds: ["cat_teams_meeting", "cat_client_meeting", "cat_internal_meeting"],
    }
  }
  return { categoryId }
}

export function resolveCategoryColour(
  categoryId: string,
  fallback?: string | null,
): string {
  return CATEGORY_COLOUR_DEFAULTS[categoryId]?.color
    ?? fallback
    ?? "#6B7280"
}
