/** Calendar types shared across SQLite and Supabase. */

export interface EventCategoryRow {
  id: string
  name: string
  color: string
  icon: string | null
}

export interface CalendarEventRow {
  id: string
  title: string
  description: string | null
  categoryId: string
  startDate: string
  endDate: string
  allDay: number
  location: string | null
  priority: string
  status: string
  jobId: string | null
  clientId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CalendarEventWithDetails extends CalendarEventRow {
  categoryName: string
  categoryColor: string
  assignees: { userId: string; userName: string }[]
  jobDrawingNumber: string | null
  clientName: string | null
  createdByName: string
}

export interface CreateCalendarEventData {
  id: string
  title: string
  description?: string | null
  categoryId: string
  startDate: string
  endDate: string
  allDay?: number
  location?: string | null
  priority?: string
  status?: string
  jobId?: string | null
  clientId?: string | null
  createdBy: string
}

export interface UpdateCalendarEventData {
  title?: string
  description?: string | null
  categoryId?: string
  startDate?: string
  endDate?: string
  allDay?: number
  location?: string | null
  priority?: string
  status?: string
  jobId?: string | null
  clientId?: string | null
}

export interface CalendarEventListOptions {
  from: string
  to: string
  userId?: string
  categoryId?: string
  jobId?: string
  clientId?: string
}
