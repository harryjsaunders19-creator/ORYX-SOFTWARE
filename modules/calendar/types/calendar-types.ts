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
  /** Populated for annual-leave category events synced from LeaveRequest. */
  leaveRequestId?: string | null
  leaveType?: string | null
  leaveReason?: string | null
  leaveReviewStatus?: string | null
  leaveUserId?: string | null
  employeeDepartment?: string | null
  managerName?: string | null
  reviewedByName?: string | null
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
  categoryIds?: string[]
  jobId?: string
  clientId?: string
}
