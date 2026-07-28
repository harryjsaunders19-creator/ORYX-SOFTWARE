/** LeaveRequest table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import type { LeaveRequestStatus } from "@/modules/leave/constants"

export type {
  LeaveRequestRow,
  LeaveCalendarLinkRow,
  CreateLeaveRequestData,
  LeaveRequestWithMeta,
} from "../leave-types"
import type {
  LeaveRequestRow,
  LeaveCalendarLinkRow,
  CreateLeaveRequestData,
  LeaveRequestWithMeta,
} from "../leave-types"

export const leaveDb = {
  create(data: CreateLeaveRequestData): LeaveRequestRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO LeaveRequest (id, userId, leaveType, startDate, endDate, reason, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(
      data.id, data.userId, data.leaveType ?? "ANNUAL_LEAVE",
      data.startDate.slice(0, 10), data.endDate.slice(0, 10),
      data.reason?.trim() || null, now, now,
    )
    return db.prepare("SELECT * FROM LeaveRequest WHERE id = ?").get(data.id) as LeaveRequestRow
  },

  findUnique(id: string): LeaveRequestRow | null {
    return db.prepare("SELECT * FROM LeaveRequest WHERE id = ?").get(id) as LeaveRequestRow | undefined ?? null
  },

  findMany(opts: {
    userId?: string
    status?: LeaveRequestStatus
    from?: string
    to?: string
    skip?: number
    take?: number
  }): LeaveRequestWithMeta[] {
    const clauses: string[] = ["1=1"]
    const params: unknown[] = []
    if (opts.userId) { clauses.push("lr.userId = ?"); params.push(opts.userId) }
    if (opts.status) { clauses.push("lr.status = ?"); params.push(opts.status) }
    if (opts.from && opts.to) {
      clauses.push("lr.startDate <= ? AND lr.endDate >= ?")
      params.push(opts.to.slice(0, 10), opts.from.slice(0, 10))
    }
    const limit = opts.take ?? 200
    const offset = opts.skip ?? 0
    return db.prepare(`
      SELECT lr.*, u.name as userName, ep.department, ep.managerId,
             mu.name as managerName, lcl.calendarEventId
      FROM LeaveRequest lr
      JOIN User u ON u.id = lr.userId
      LEFT JOIN EmployeeProfile ep ON ep.userId = lr.userId
      LEFT JOIN User mu ON mu.id = ep.managerId
      LEFT JOIN LeaveCalendarLink lcl ON lcl.leaveRequestId = lr.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY lr.startDate DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as LeaveRequestWithMeta[]
  },

  updateStatus(
    id: string,
    status: LeaveRequestStatus,
    reviewer: { id: string; name: string },
  ): LeaveRequestRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    db.prepare(`
      UPDATE LeaveRequest
      SET status = ?, reviewedBy = ?, reviewedByName = ?, reviewedAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(status, reviewer.id, reviewer.name, now, now, id)
    return this.findUnique(id)
  },

  updateDates(id: string, startDate: string, endDate: string, reason?: string | null): LeaveRequestRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    db.prepare(`
      UPDATE LeaveRequest SET startDate = ?, endDate = ?, reason = ?, updatedAt = ? WHERE id = ?
    `).run(startDate.slice(0, 10), endDate.slice(0, 10), reason?.trim() ?? existing.reason, now, id)
    return this.findUnique(id)
  },

  cancel(id: string): LeaveRequestRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    db.prepare(`UPDATE LeaveRequest SET status = 'CANCELLED', updatedAt = ? WHERE id = ?`).run(now, id)
    return this.findUnique(id)
  },

  getLinkByLeaveId(leaveRequestId: string): LeaveCalendarLinkRow | null {
    return db.prepare("SELECT * FROM LeaveCalendarLink WHERE leaveRequestId = ?").get(leaveRequestId) as LeaveCalendarLinkRow | undefined ?? null
  },

  getLinkByEventId(calendarEventId: string): LeaveCalendarLinkRow | null {
    return db.prepare("SELECT * FROM LeaveCalendarLink WHERE calendarEventId = ?").get(calendarEventId) as LeaveCalendarLinkRow | undefined ?? null
  },

  upsertLink(leaveRequestId: string, calendarEventId: string, userId: string, status: LeaveRequestStatus): void {
    const now = nowIso()
    const existing = this.getLinkByLeaveId(leaveRequestId)
    if (existing) {
      db.prepare(`
        UPDATE LeaveCalendarLink SET calendarEventId = ?, status = ?, updatedAt = ? WHERE leaveRequestId = ?
      `).run(calendarEventId, status, now, leaveRequestId)
    } else {
      db.prepare(`
        INSERT INTO LeaveCalendarLink (leaveRequestId, calendarEventId, userId, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(leaveRequestId, calendarEventId, userId, status, now, now)
    }
  },

  deleteLink(leaveRequestId: string): void {
    db.prepare("DELETE FROM LeaveCalendarLink WHERE leaveRequestId = ?").run(leaveRequestId)
  },

  /** Bulk-fetch leave metadata for calendar events — avoids N+1. */
  getMetaForEvents(eventIds: string[]): Map<string, {
    leaveRequestId: string
    leaveType: string
    reason: string | null
    status: LeaveRequestStatus
    userId: string
    department: string | null
    managerName: string | null
    reviewedByName: string | null
  }> {
    const map = new Map<string, {
      leaveRequestId: string
      leaveType: string
      reason: string | null
      status: LeaveRequestStatus
      userId: string
      department: string | null
      managerName: string | null
      reviewedByName: string | null
    }>()
    if (!eventIds.length) return map
    const placeholders = eventIds.map(() => "?").join(",")
    const rows = db.prepare(`
      SELECT lcl.calendarEventId, lr.id as leaveRequestId, lr.leaveType, lr.reason, lr.status,
             lr.userId, ep.department, mu.name as managerName, lr.reviewedByName
      FROM LeaveCalendarLink lcl
      JOIN LeaveRequest lr ON lr.id = lcl.leaveRequestId
      LEFT JOIN EmployeeProfile ep ON ep.userId = lr.userId
      LEFT JOIN User mu ON mu.id = ep.managerId
      WHERE lcl.calendarEventId IN (${placeholders})
    `).all(...eventIds) as {
      calendarEventId: string
      leaveRequestId: string
      leaveType: string
      reason: string | null
      status: LeaveRequestStatus
      userId: string
      department: string | null
      managerName: string | null
      reviewedByName: string | null
    }[]
    for (const row of rows) {
      map.set(row.calendarEventId, {
        leaveRequestId: row.leaveRequestId,
        leaveType: row.leaveType,
        reason: row.reason,
        status: row.status,
        userId: row.userId,
        department: row.department,
        managerName: row.managerName,
        reviewedByName: row.reviewedByName,
      })
    }
    return map
  },
}
