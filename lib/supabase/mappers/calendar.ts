import type { CalendarEventRow, EventCategoryRow } from "@/lib/db/calendar-types"

export interface SupabaseCalendarEventRow {
  id: string
  title: string
  description: string | null
  category_id: string
  start_date: string
  end_date: string
  all_day: boolean
  location: string | null
  priority: string
  status: string
  job_id: string | null
  client_id: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface SupabaseEventCategoryRow {
  id: string
  name: string
  color: string
  icon: string | null
}

export interface SupabaseCalendarAssignmentRow {
  id: string
  event_id: string
  user_id: string
}

export function toCalendarEventRow(row: SupabaseCalendarEventRow): CalendarEventRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    categoryId: row.category_id,
    startDate: row.start_date,
    endDate: row.end_date,
    allDay: row.all_day ? 1 : 0,
    location: row.location,
    priority: row.priority,
    status: row.status,
    jobId: row.job_id,
    clientId: row.client_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseCalendarEventRow(row: CalendarEventRow): SupabaseCalendarEventRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category_id: row.categoryId,
    start_date: row.startDate,
    end_date: row.endDate,
    all_day: row.allDay === 1,
    location: row.location,
    priority: row.priority,
    status: row.status,
    job_id: row.jobId,
    client_id: row.clientId,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

export function toEventCategoryRow(row: SupabaseEventCategoryRow): EventCategoryRow {
  return { id: row.id, name: row.name, color: row.color, icon: row.icon }
}

export function toSupabaseEventCategoryRow(row: EventCategoryRow): SupabaseEventCategoryRow {
  return { id: row.id, name: row.name, color: row.color, icon: row.icon }
}

export function toSupabaseAssignment(id: string, eventId: string, userId: string): SupabaseCalendarAssignmentRow {
  return { id, event_id: eventId, user_id: userId }
}
