import { createAdminClient } from "@/shared/supabase/admin"
import type { CalendarEventRow, EventCategoryRow } from "../types/calendar-types"
import {
  toCalendarEventRow,
  toEventCategoryRow,
  toSupabaseCalendarEventRow,
  toSupabaseEventCategoryRow,
  toSupabaseAssignment,
} from "./mapper"

function events() {
  return createAdminClient().from("calendar_events")
}

function categories() {
  return createAdminClient().from("event_categories")
}

function assignments() {
  return createAdminClient().from("calendar_assignments")
}

export interface CalendarEventListOptions {
  from: string
  to: string
  userId?: string
  categoryId?: string
  categoryIds?: string[]
  jobId?: string
  clientId?: string
}

export interface CalendarAssignmentRow {
  id: string
  eventId: string
  userId: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any

export const supabaseCalendarRepo = {
  async listCategories(): Promise<EventCategoryRow[]> {
    const { data, error } = await categories().select("*").order("name")
    if (error) throw error
    return (data ?? []).map(toEventCategoryRow)
  },

  async upsertCategory(row: EventCategoryRow): Promise<void> {
    const { error } = await categories().upsert(toSupabaseEventCategoryRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async findMany(opts: CalendarEventListOptions): Promise<CalendarEventRow[]> {
    let eventIds: string[] | null = null
    if (opts.userId) {
      const { data, error } = await assignments().select("event_id").eq("user_id", opts.userId)
      if (error) throw error
      eventIds = [...new Set((data ?? []).map((r: { event_id: string }) => r.event_id))]
      if (!eventIds.length) return []
    }

    let q: Q = events().select("*").lte("start_date", opts.to).gte("end_date", opts.from)
    if (opts.categoryIds?.length) q = q.in("category_id", opts.categoryIds)
    else if (opts.categoryId) q = q.eq("category_id", opts.categoryId)
    if (opts.jobId) q = q.eq("job_id", opts.jobId)
    if (opts.clientId) q = q.eq("client_id", opts.clientId)
    if (eventIds) q = q.in("id", eventIds)

    const { data, error } = await q.order("start_date").order("title")
    if (error) throw error
    return (data ?? []).map(toCalendarEventRow)
  },

  async findUnique(id: string): Promise<CalendarEventRow | null> {
    const { data, error } = await events().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toCalendarEventRow(data) : null
  },

  async upsertEvent(row: CalendarEventRow): Promise<void> {
    const { error } = await events().upsert(toSupabaseCalendarEventRow(row), { onConflict: "id" })
    if (error) throw error
  },

  async deleteEvent(id: string): Promise<void> {
    const { error } = await events().delete().eq("id", id)
    if (error) throw error
  },

  async getAssignmentUserIds(eventId: string): Promise<string[]> {
    const { data, error } = await assignments()
      .select("user_id")
      .eq("event_id", eventId)
      .order("user_id")
    if (error) throw error
    return (data ?? []).map((r: { user_id: string }) => r.user_id)
  },

  /** Bulk-fetch all assignments for a set of events — one query instead of N. */
  async getAssignmentsForEvents(eventIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>()
    if (!eventIds.length) return map
    const { data, error } = await assignments()
      .select("event_id, user_id")
      .in("event_id", eventIds)
    if (error) throw error
    for (const row of data ?? []) {
      const eid = row.event_id as string
      const list = map.get(eid) ?? []
      list.push(row.user_id as string)
      map.set(eid, list)
    }
    return map
  },

  async replaceAssignments(eventId: string, rows: CalendarAssignmentRow[]): Promise<void> {
    const { error: delErr } = await assignments().delete().eq("event_id", eventId)
    if (delErr) throw delErr
    if (!rows.length) return
    const { error } = await assignments().upsert(
      rows.map((r) => toSupabaseAssignment(r.id, r.eventId, r.userId)),
      { onConflict: "id" },
    )
    if (error) throw error
  },
}
