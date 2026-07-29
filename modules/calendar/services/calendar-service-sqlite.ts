/**
 * Calendar — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads calendar-service-supabase.ts instead (isSupabaseOnly()).
 */
import type {
  CalendarEventListOptions,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  EventCategoryRow,
  UpdateCalendarEventData,
} from "../types/calendar-types"
import { calendarDb } from "@/lib/db/stores"
import { enrichEventsWithLeave } from "@/modules/leave/enrichment"

export const calendarService = {
  async categories(): Promise<EventCategoryRow[]> {
    return calendarDb.categories()
  },

  async findMany(opts: CalendarEventListOptions): Promise<CalendarEventWithDetails[]> {
    const events = calendarDb.findMany(opts)
    const needsLeave = !opts.categoryIds?.length
      || opts.categoryIds.some(id => id === "cat_leave" || id === "cat_annual_leave")
    return needsLeave ? enrichEventsWithLeave(events) : events
  },

  async findUnique(id: string): Promise<CalendarEventWithDetails | null> {
    const event = calendarDb.findUnique(id)
    if (!event) return null
    const [withLeave] = await enrichEventsWithLeave([event])
    return withLeave ?? event
  },

  async create(
    data: CreateCalendarEventData,
    assigneeIds?: string[],
  ): Promise<CalendarEventWithDetails | null> {
    calendarDb.create(data)
    if (assigneeIds?.length) calendarDb.setAssignees(data.id, assigneeIds)
    return this.findUnique(data.id)
  },

  async update(
    id: string,
    data: UpdateCalendarEventData,
    assigneeIds?: string[],
  ): Promise<CalendarEventWithDetails | null> {
    const updated = calendarDb.update(id, data)
    if (!updated) return null
    if (assigneeIds !== undefined) calendarDb.setAssignees(id, assigneeIds)
    return this.findUnique(id)
  },

  async delete(id: string): Promise<boolean> {
    return calendarDb.delete(id)
  },
}
