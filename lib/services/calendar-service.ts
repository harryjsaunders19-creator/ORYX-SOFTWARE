/**
 * Calendar during Supabase migration.
 *
 * When SUPABASE_CALENDAR=true:
 *   - Reads come from Supabase (enriched with SQLite user/job/client names)
 *   - Writes SQLite first, then mirror event + assignments
 */
import { db } from "@/lib/db/connection"
import type {
  CalendarEventListOptions,
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  EventCategoryRow,
  UpdateCalendarEventData,
} from "@/lib/db/calendar-types"
import { calendarDb, clientDb, jobDb } from "@/lib/db/stores"
import { userService } from "@/lib/services/user-service"
import { useSupabaseCalendar } from "@/lib/supabase/feature-flags"
import { supabaseCalendarRepo } from "@/lib/supabase/repositories/calendar"

interface AssignmentRow {
  id: string
  eventId: string
  userId: string
}

async function assigneeDetails(userIds: string[]): Promise<{ userId: string; userName: string }[]> {
  const details = await Promise.all(
    userIds.map(async (userId) => {
      const u = await userService.findUnique(userId)
      return u ? { userId, userName: u.name } : null
    }),
  )
  return details
    .filter((a): a is { userId: string; userName: string } => a != null)
    .sort((a, b) => a.userName.localeCompare(b.userName))
}

async function getAssigneesForEvent(eventId: string): Promise<{ userId: string; userName: string }[]> {
  if (!useSupabaseCalendar()) return calendarDb.getAssignees(eventId)
  const userIds = await supabaseCalendarRepo.getAssignmentUserIds(eventId)
  return assigneeDetails(userIds)
}

function enrichEvent(
  row: CalendarEventRow,
  categoryMap: Map<string, EventCategoryRow>,
  assignees: { userId: string; userName: string }[],
  createdByName: string,
): CalendarEventWithDetails {
  const cat = categoryMap.get(row.categoryId)
  const job = row.jobId ? jobDb.findUnique(row.jobId) : null
  const client = row.clientId ? clientDb.findUnique(row.clientId) : null
  return {
    ...row,
    categoryName: cat?.name ?? "",
    categoryColor: cat?.color ?? "#6B7280",
    assignees,
    jobDrawingNumber: job?.drawingNumber ?? null,
    clientName: client?.name ?? null,
    createdByName,
  }
}

async function categoryMap(): Promise<Map<string, EventCategoryRow>> {
  const cats = useSupabaseCalendar()
    ? await supabaseCalendarRepo.listCategories()
    : calendarDb.categories()
  return new Map(cats.map((c) => [c.id, c]))
}

async function mirrorEvent(eventId: string): Promise<void> {
  if (!useSupabaseCalendar()) return
  const row = db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(eventId) as CalendarEventRow | undefined
  if (!row) return
  await supabaseCalendarRepo.upsertEvent(row)
  const assignmentRows = db
    .prepare("SELECT id, eventId, userId FROM CalendarAssignment WHERE eventId = ?")
    .all(eventId) as AssignmentRow[]
  await supabaseCalendarRepo.replaceAssignments(eventId, assignmentRows)
}

export const calendarService = {
  async categories(): Promise<EventCategoryRow[]> {
    if (!useSupabaseCalendar()) return calendarDb.categories()
    return supabaseCalendarRepo.listCategories()
  },

  async findMany(opts: CalendarEventListOptions): Promise<CalendarEventWithDetails[]> {
    const cats = await categoryMap()
    if (!useSupabaseCalendar()) return calendarDb.findMany(opts)

    const rows = await supabaseCalendarRepo.findMany(opts)
    return Promise.all(
      rows.map(async (row) => {
        const creator = await userService.findUnique(row.createdBy)
        return enrichEvent(row, cats, await getAssigneesForEvent(row.id), creator?.name ?? "")
      }),
    )
  },

  async findUnique(id: string): Promise<CalendarEventWithDetails | null> {
    const cats = await categoryMap()
    if (!useSupabaseCalendar()) return calendarDb.findUnique(id)

    const row = await supabaseCalendarRepo.findUnique(id)
    if (!row) return null
    return enrichEvent(row, cats, await getAssigneesForEvent(id), (await userService.findUnique(row.createdBy))?.name ?? "")
  },

  async create(
    data: CreateCalendarEventData,
    assigneeIds?: string[],
  ): Promise<CalendarEventWithDetails | null> {
    calendarDb.create(data)
    if (assigneeIds?.length) calendarDb.setAssignees(data.id, assigneeIds)
    await mirrorEvent(data.id)
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
    await mirrorEvent(id)
    return this.findUnique(id)
  },

  async delete(id: string): Promise<boolean> {
    const ok = calendarDb.delete(id)
    if (ok && useSupabaseCalendar()) await supabaseCalendarRepo.deleteEvent(id)
    return ok
  },
}
