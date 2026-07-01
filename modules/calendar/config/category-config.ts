import type { EventCategoryRow } from "../types/calendar-types"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import { ANNUAL_LEAVE_CATEGORY_ID } from "@/lib/leave/constants"

/** Categories shown in calendar filters and the new-event dialog. */
export const CALENDAR_USER_CATEGORY_IDS = [
  "cat_site_visit",
  "cat_teams_meeting",
  ...(isExperimentalEnabled("leave") ? (["cat_leave"] as const) : []),
] as const

export type CalendarUserCategoryId = (typeof CALENDAR_USER_CATEGORY_IDS)[number]

/** Leave events — manual (`cat_leave`) and synced leave requests (`cat_annual_leave`). */
export const LEAVE_CATEGORY_IDS = ["cat_leave", ANNUAL_LEAVE_CATEGORY_ID] as const

const DEFAULTS: Record<string, { name: string; color: string }> = {
  cat_site_visit:    { name: "Site Visit",    color: "#3B82F6" },
  cat_teams_meeting: { name: "Teams Meeting", color: "#A855F7" },
  cat_leave:         { name: "Leave",         color: "#6B7280" },
}

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
    const def = DEFAULTS[id]
    return row ?? { id, name: def.name, color: def.color, icon: null }
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
  return { categoryId }
}
