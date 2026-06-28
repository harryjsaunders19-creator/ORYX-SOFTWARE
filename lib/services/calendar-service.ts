/**
 * Calendar during Supabase migration.
 *
 * When SUPABASE_CALENDAR=true:
 *   - Reads come from Supabase (enriched with bulk-fetched user/job/client names)
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
import { calendarDb } from "@/lib/db/stores"
import { userService } from "@/lib/services/user-service"
import { jobService } from "@/lib/services/job-service"
import { clientService } from "@/lib/services/client-service"
import { useSupabaseCalendar } from "@/lib/supabase/feature-flags"
import { supabaseCalendarRepo } from "@/lib/supabase/repositories/calendar"
import { ensureClientInSqlite } from "@/lib/services/client-service"
import { ensureJobInSqliteForBilling } from "@/lib/services/job-service"
import { ensureUsersInSqlite } from "@/lib/services/user-service"

async function ensureCalendarEventInSqlite(id: string): Promise<void> {
  if (!useSupabaseCalendar()) return
  if (calendarDb.findUnique(id)) return
  try {
    const row = await supabaseCalendarRepo.findUnique(id)
    if (!row) return
    if (row.clientId) await ensureClientInSqlite(row.clientId)
    if (row.jobId) await ensureJobInSqliteForBilling(row.jobId)
    calendarDb.rawInsertOrIgnore(row)
  } catch {
    // Non-fatal
  }
}

interface AssignmentRow {
  id: string
  eventId: string
  userId: string
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

/** Enrich Supabase calendar rows with names — bulk queries, no per-row N+1. */
async function enrichMany(
  rows: CalendarEventRow[],
  cats: Map<string, EventCategoryRow>,
): Promise<CalendarEventWithDetails[]> {
  if (!rows.length) return []

  const eventIds = rows.map(r => r.id)
  const jobIds = [...new Set(rows.map(r => r.jobId).filter((id): id is string => !!id))]
  const clientIds = [...new Set(rows.map(r => r.clientId).filter((id): id is string => !!id))]

  const [assignmentMap, jobs, clients] = await Promise.all([
    supabaseCalendarRepo.getAssignmentsForEvents(eventIds),
    jobService.findManyByIds(jobIds),
    clientService.findManyByIds(clientIds),
  ])

  const allUserIds = [...new Set([
    ...rows.map(r => r.createdBy),
    ...[...assignmentMap.values()].flat(),
  ])]
  const users = await userService.findManyByIds(allUserIds)
  const userNameById = new Map(users.map(u => [u.id, u.name]))
  const jobById = new Map(jobs.map(j => [j.id, j]))
  const clientById = new Map(clients.map(c => [c.id, c]))

  return rows.map(row => {
    const cat = cats.get(row.categoryId)
    const assigneeIds = assignmentMap.get(row.id) ?? []
    const assignees = assigneeIds
      .map(userId => ({ userId, userName: userNameById.get(userId) ?? "" }))
      .filter(a => a.userName)
      .sort((a, b) => a.userName.localeCompare(b.userName))
    return {
      ...row,
      categoryName: cat?.name ?? "",
      categoryColor: cat?.color ?? "#6B7280",
      assignees,
      jobDrawingNumber: row.jobId ? jobById.get(row.jobId)?.drawingNumber ?? null : null,
      clientName: row.clientId ? clientById.get(row.clientId)?.name ?? null : null,
      createdByName: userNameById.get(row.createdBy) ?? "",
    }
  })
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
    return enrichMany(rows, cats)
  },

  async findUnique(id: string): Promise<CalendarEventWithDetails | null> {
    const cats = await categoryMap()
    if (!useSupabaseCalendar()) return calendarDb.findUnique(id)

    const row = await supabaseCalendarRepo.findUnique(id)
    if (!row) return null
    const [enriched] = await enrichMany([row], cats)
    return enriched ?? null
  },

  async create(
    data: CreateCalendarEventData,
    assigneeIds?: string[],
  ): Promise<CalendarEventWithDetails | null> {
    if (data.clientId) await ensureClientInSqlite(data.clientId)
    if (data.jobId) await ensureJobInSqliteForBilling(data.jobId)
    if (assigneeIds?.length) await ensureUsersInSqlite(assigneeIds)
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
    await ensureCalendarEventInSqlite(id)
    if (data.clientId) await ensureClientInSqlite(data.clientId)
    if (data.jobId) await ensureJobInSqliteForBilling(data.jobId)
    if (assigneeIds?.length) await ensureUsersInSqlite(assigneeIds)
    const updated = calendarDb.update(id, data)
    if (!updated) return null
    if (assigneeIds !== undefined) calendarDb.setAssignees(id, assigneeIds)
    await mirrorEvent(id)
    return this.findUnique(id)
  },

  async delete(id: string): Promise<boolean> {
    await ensureCalendarEventInSqlite(id)
    const ok = calendarDb.delete(id)
    if (ok && useSupabaseCalendar()) await supabaseCalendarRepo.deleteEvent(id)
    return ok
  },
}
