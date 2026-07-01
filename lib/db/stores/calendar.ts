/** CalendarEvent table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type {
  EventCategoryRow,
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  UpdateCalendarEventData,
} from "../calendar-types"
import type {
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  EventCategoryRow,
  UpdateCalendarEventData,
} from "../calendar-types"

export const calendarDb = {
  categories(): EventCategoryRow[] {
    return db.prepare("SELECT * FROM EventCategory ORDER BY name ASC").all() as EventCategoryRow[]
  },

  findMany(opts: { from: string; to: string; userId?: string; categoryId?: string; categoryIds?: string[]; jobId?: string; clientId?: string }): CalendarEventWithDetails[] {
    const clauses = ["e.startDate <= ? AND e.endDate >= ?"]
    const params: unknown[] = [opts.to, opts.from]

    if (opts.categoryIds?.length) {
      clauses.push(`e.categoryId IN (${opts.categoryIds.map(() => "?").join(",")})`)
      params.push(...opts.categoryIds)
    } else if (opts.categoryId) {
      clauses.push("e.categoryId = ?")
      params.push(opts.categoryId)
    }
    if (opts.jobId)      { clauses.push("e.jobId = ?");      params.push(opts.jobId) }
    if (opts.clientId)   { clauses.push("e.clientId = ?");   params.push(opts.clientId) }
    if (opts.userId) {
      clauses.push("EXISTS (SELECT 1 FROM CalendarAssignment ca WHERE ca.eventId = e.id AND ca.userId = ?)")
      params.push(opts.userId)
    }

    const rows = db.prepare(`
      SELECT e.*, ec.name as categoryName, ec.color as categoryColor,
             j.drawingNumber as jobDrawingNumber, c.name as clientName,
             u.name as createdByName
      FROM CalendarEvent e
      LEFT JOIN EventCategory ec ON ec.id = e.categoryId
      LEFT JOIN Job j ON j.id = e.jobId
      LEFT JOIN Client c ON c.id = e.clientId
      LEFT JOIN User u ON u.id = e.createdBy
      WHERE ${clauses.join(" AND ")}
      ORDER BY e.startDate ASC, e.title ASC
    `).all(...params) as (CalendarEventRow & { categoryName: string; categoryColor: string; jobDrawingNumber: string | null; clientName: string | null; createdByName: string })[]

    const assigneeMap = this.getAssigneesForEvents(rows.map(r => r.id))
    return rows.map(r => ({ ...r, assignees: assigneeMap.get(r.id) ?? [] }))
  },

  /** Bulk-fetch assignees for many events in one query — avoids N+1. */
  getAssigneesForEvents(eventIds: string[]): Map<string, { userId: string; userName: string }[]> {
    const map = new Map<string, { userId: string; userName: string }[]>()
    if (!eventIds.length) return map
    const placeholders = eventIds.map(() => "?").join(",")
    const rows = db.prepare(`
      SELECT ca.eventId, ca.userId, u.name as userName
      FROM CalendarAssignment ca
      JOIN User u ON u.id = ca.userId
      WHERE ca.eventId IN (${placeholders})
      ORDER BY u.name ASC
    `).all(...eventIds) as { eventId: string; userId: string; userName: string }[]
    for (const row of rows) {
      const list = map.get(row.eventId) ?? []
      list.push({ userId: row.userId, userName: row.userName })
      map.set(row.eventId, list)
    }
    return map
  },

  findUnique(id: string): CalendarEventWithDetails | null {
    const row = db.prepare(`
      SELECT e.*, ec.name as categoryName, ec.color as categoryColor,
             j.drawingNumber as jobDrawingNumber, c.name as clientName,
             u.name as createdByName
      FROM CalendarEvent e
      LEFT JOIN EventCategory ec ON ec.id = e.categoryId
      LEFT JOIN Job j ON j.id = e.jobId
      LEFT JOIN Client c ON c.id = e.clientId
      LEFT JOIN User u ON u.id = e.createdBy
      WHERE e.id = ?
    `).get(id) as (CalendarEventRow & { categoryName: string; categoryColor: string; jobDrawingNumber: string | null; clientName: string | null; createdByName: string }) | undefined
    if (!row) return null
    return { ...row, assignees: this.getAssignees(id) }
  },

  create(data: CreateCalendarEventData): CalendarEventRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO CalendarEvent (id, title, description, categoryId, startDate, endDate, allDay, location, priority, status, jobId, clientId, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.title.trim(), data.description?.trim() || null,
      data.categoryId, data.startDate, data.endDate, data.allDay ?? 1,
      data.location?.trim() || null, data.priority ?? "MEDIUM", data.status ?? "SCHEDULED",
      data.jobId ?? null, data.clientId ?? null, data.createdBy, now, now,
    )
    return db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(data.id) as CalendarEventRow
  },

  update(id: string, data: UpdateCalendarEventData): CalendarEventRow | null {
    const existing = db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(id) as CalendarEventRow | undefined
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    if (data.title       !== undefined) { fields.push('"title" = ?');       params.push(data.title.trim()) }
    if (data.description !== undefined) { fields.push('"description" = ?'); params.push(data.description?.trim() || null) }
    if (data.categoryId  !== undefined) { fields.push('"categoryId" = ?');  params.push(data.categoryId) }
    if (data.startDate   !== undefined) { fields.push('"startDate" = ?');   params.push(data.startDate) }
    if (data.endDate     !== undefined) { fields.push('"endDate" = ?');     params.push(data.endDate) }
    if (data.allDay      !== undefined) { fields.push('"allDay" = ?');      params.push(data.allDay) }
    if (data.location    !== undefined) { fields.push('"location" = ?');    params.push(data.location?.trim() || null) }
    if (data.priority    !== undefined) { fields.push('"priority" = ?');    params.push(data.priority) }
    if (data.status      !== undefined) { fields.push('"status" = ?');      params.push(data.status) }
    if (data.jobId       !== undefined) { fields.push('"jobId" = ?');       params.push(data.jobId) }
    if (data.clientId    !== undefined) { fields.push('"clientId" = ?');    params.push(data.clientId) }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.prepare(`UPDATE CalendarEvent SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(id) as CalendarEventRow
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM CalendarEvent WHERE id = ?").run(id).changes > 0
  },

  getAssignees(eventId: string): { userId: string; userName: string }[] {
    return db.prepare(`
      SELECT ca.userId, u.name as userName
      FROM CalendarAssignment ca
      JOIN User u ON u.id = ca.userId
      WHERE ca.eventId = ?
      ORDER BY u.name ASC
    `).all(eventId) as { userId: string; userName: string }[]
  },

  setAssignees(eventId: string, userIds: string[]): void {
    db.transaction(() => {
      db.prepare("DELETE FROM CalendarAssignment WHERE eventId = ?").run(eventId)
      const insert = db.prepare("INSERT INTO CalendarAssignment (id, eventId, userId) VALUES (?, ?, ?)")
      for (const uid of userIds) {
        insert.run(nanoid(), eventId, uid)
      }
    })()
  },

  /** Insert a calendar event row from an external source (e.g. Supabase) without side-effects. */
  rawInsertOrIgnore(row: import("@/lib/db/calendar-types").CalendarEventRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO CalendarEvent
        (id,title,description,categoryId,startDate,endDate,allDay,location,priority,status,
         jobId,clientId,createdBy,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.id, row.title, row.description ?? null, row.categoryId,
      row.startDate, row.endDate, row.allDay ?? 1, row.location ?? null,
      row.priority ?? "MEDIUM", row.status ?? "SCHEDULED",
      row.jobId ?? null, row.clientId ?? null, row.createdBy,
      row.createdAt, row.updatedAt,
    )
  },
}
