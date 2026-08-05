/**
 * Display helpers for the operations calendar — colour resolution,
 * overdue tinting, and view-range utilities.
 */

import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import {
  CATEGORY_COLOUR_DEFAULTS,
  resolveCategoryColour,
} from "../config/category-config"

export type CalendarViewMode = "month" | "week" | "agenda"

export function getCalendarRange(date: Date, view: CalendarViewMode): { from: string; to: string } {
  if (view === "week") {
    const from = startOfWeek(date, { weekStartsOn: 1 })
    const to = endOfWeek(date, { weekStartsOn: 1 })
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
    }
  }
  if (view === "agenda") {
    const from = date
    const to = addDays(date, 56)
    return {
      from: format(from, "yyyy-MM-dd"),
      to: format(to, "yyyy-MM-dd"),
    }
  }
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  return {
    from: format(startOfWeek(monthStart, { weekStartsOn: 1 }), "yyyy-MM-dd"),
    to: format(endOfWeek(monthEnd, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  }
}

/** Day-key YYYY-MM-DD from an ISO start/end timestamp. */
export function eventDayKey(iso: string): string {
  return iso.slice(0, 10)
}

export function isEventOverdue(opts: {
  endDate: string
  status?: string | null
  categoryId?: string | null
}): boolean {
  if (opts.status === "COMPLETED" || opts.status === "CANCELLED") return false
  if (opts.categoryId && isLeaveLike(opts.categoryId)) return false
  const end = eventDayKey(opts.endDate)
  const today = format(new Date(), "yyyy-MM-dd")
  return end < today
}

function isLeaveLike(categoryId: string): boolean {
  return categoryId === "cat_leave" || categoryId.includes("leave")
}

/**
 * Resolve the pill colour for an event.
 * Overdue non-leave items use muted red; completed use muted green.
 */
export function resolveEventDisplayColour(opts: {
  categoryId: string
  categoryColor?: string | null
  status?: string | null
  endDate: string
  overrideColor?: string | null
}): string {
  if (opts.overrideColor) return opts.overrideColor
  if (opts.status === "COMPLETED") {
    return CATEGORY_COLOUR_DEFAULTS.cat_completed.color
  }
  if (isEventOverdue(opts)) {
    return CATEGORY_COLOUR_DEFAULTS.cat_overdue.color
  }
  return resolveCategoryColour(opts.categoryId, opts.categoryColor)
}

/** Accessible category label (colour is never the sole indicator). */
export function eventTypeLabel(categoryId: string, categoryName?: string | null): string {
  if (categoryName?.trim()) return categoryName.trim()
  return CATEGORY_COLOUR_DEFAULTS[categoryId]?.name ?? "Event"
}
