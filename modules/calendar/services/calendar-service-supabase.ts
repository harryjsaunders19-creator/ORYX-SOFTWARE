/**
 * Supabase-only calendar operations (Vercel / isSupabaseOnly).
 * Never imports SQLite calendarDb / connection or ensure*InSqlite helpers.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import type {
  CalendarEventListOptions,
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  EventCategoryRow,
  UpdateCalendarEventData,
} from "../types/calendar-types"
import { userService } from "@/modules/users"
import { clientService } from "@/modules/clients"
import { supabaseJobRepo } from "@/modules/jobs/supabase/repository"
import { supabaseCalendarRepo } from "../supabase/repository"
import { enrichEventsWithLeave } from "@/modules/leave/enrichment"

async function categoryMap(): Promise<Map<string, EventCategoryRow>> {
  const cats = await supabaseCalendarRepo.listCategories()
  return new Map(cats.map((c) => [c.id, c]))
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
    supabaseJobRepo.findManyByIdsSlim(jobIds),
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

function buildEventRow(data: CreateCalendarEventData): CalendarEventRow {
  const now = nowIso()
  return {
    id: data.id,
    title: data.title.trim(),
    description: data.description?.trim() || null,
    categoryId: data.categoryId,
    startDate: data.startDate,
    endDate: data.endDate,
    allDay: data.allDay ?? 1,
    location: data.location?.trim() || null,
    priority: data.priority ?? "MEDIUM",
    status: data.status ?? "SCHEDULED",
    jobId: data.jobId ?? null,
    clientId: data.clientId ?? null,
    createdBy: data.createdBy,
    createdAt: now,
    updatedAt: now,
  }
}

export const calendarService = {
  async categories(): Promise<EventCategoryRow[]> {
    return supabaseCalendarRepo.listCategories()
  },

  async findMany(opts: CalendarEventListOptions): Promise<CalendarEventWithDetails[]> {
    const [cats, rows] = await Promise.all([
      categoryMap(),
      supabaseCalendarRepo.findMany(opts),
    ])
    const events = await enrichMany(rows, cats)
    // Skip leave enrichment when the query already excludes leave categories.
    const needsLeave = !opts.categoryIds?.length
      || opts.categoryIds.some(id => id === "cat_leave" || id === "cat_annual_leave")
    return needsLeave ? enrichEventsWithLeave(events) : events
  },

  async findUnique(id: string): Promise<CalendarEventWithDetails | null> {
    const [cats, row] = await Promise.all([
      categoryMap(),
      supabaseCalendarRepo.findUnique(id),
    ])
    if (!row) return null
    const [enriched] = await enrichMany([row], cats)
    if (!enriched) return null
    const [withLeave] = await enrichEventsWithLeave([enriched])
    return withLeave ?? enriched
  },

  async create(
    data: CreateCalendarEventData,
    assigneeIds?: string[],
  ): Promise<CalendarEventWithDetails | null> {
    const row = buildEventRow(data)
    await supabaseCalendarRepo.upsertEvent(row)
    if (assigneeIds?.length) {
      await supabaseCalendarRepo.replaceAssignments(
        data.id,
        assigneeIds.map(userId => ({ id: nanoid(), eventId: data.id, userId })),
      )
    } else {
      await supabaseCalendarRepo.replaceAssignments(data.id, [])
    }
    return this.findUnique(data.id)
  },

  async update(
    id: string,
    data: UpdateCalendarEventData,
    assigneeIds?: string[],
  ): Promise<CalendarEventWithDetails | null> {
    const existing = await supabaseCalendarRepo.findUnique(id)
    if (!existing) return null
    const updated: CalendarEventRow = {
      ...existing,
      title: data.title !== undefined ? data.title.trim() : existing.title,
      description:
        data.description !== undefined
          ? (data.description?.trim() || null)
          : existing.description,
      categoryId: data.categoryId ?? existing.categoryId,
      startDate: data.startDate ?? existing.startDate,
      endDate: data.endDate ?? existing.endDate,
      allDay: data.allDay ?? existing.allDay,
      location:
        data.location !== undefined ? (data.location?.trim() || null) : existing.location,
      priority: data.priority ?? existing.priority,
      status: data.status ?? existing.status,
      jobId: data.jobId !== undefined ? data.jobId : existing.jobId,
      clientId: data.clientId !== undefined ? data.clientId : existing.clientId,
      updatedAt: nowIso(),
    }
    await supabaseCalendarRepo.upsertEvent(updated)
    if (assigneeIds !== undefined) {
      await supabaseCalendarRepo.replaceAssignments(
        id,
        assigneeIds.map(userId => ({ id: nanoid(), eventId: id, userId })),
      )
    }
    return this.findUnique(id)
  },

  async delete(id: string): Promise<boolean> {
    const existing = await supabaseCalendarRepo.findUnique(id)
    if (!existing) return false
    await supabaseCalendarRepo.deleteEvent(id)
    return true
  },
}
