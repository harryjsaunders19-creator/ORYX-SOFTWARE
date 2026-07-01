/** ArchiveLog audit table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { ArchiveLogRow } from "../archive-types"

export const archiveLogDb = {
  insert(row: ArchiveLogRow): void {
    db.prepare(`
      INSERT INTO ArchiveLog (id,entityType,entityId,entityLabel,action,performedBy,performedByName,performedAt,reason)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(row.id, row.entityType, row.entityId, row.entityLabel, row.action,
           row.performedBy, row.performedByName, row.performedAt, row.reason ?? null)
  },

  log(entry: Omit<ArchiveLogRow, "id" | "performedAt"> & { performedAt?: string }): void {
    const id = nanoid()
    const now = entry.performedAt ?? nowIso()
    this.insert({ ...entry, id, performedAt: now, reason: entry.reason ?? null })
  },

  findMany(limit = 200): ArchiveLogRow[] {
    return db.prepare(
      "SELECT * FROM ArchiveLog ORDER BY performedAt DESC LIMIT ?"
    ).all(limit) as ArchiveLogRow[]
  },

  findForEntity(entityType: string, entityId: string): ArchiveLogRow[] {
    return db.prepare(
      "SELECT * FROM ArchiveLog WHERE entityType = ? AND entityId = ? ORDER BY performedAt DESC"
    ).all(entityType, entityId) as ArchiveLogRow[]
  },

  /** Latest archive action per entity id (for cancelled-job metadata on list views). */
  findLatestArchiveForEntities(entityType: string, entityIds: string[]): Map<string, ArchiveLogRow> {
    const result = new Map<string, ArchiveLogRow>()
    if (!entityIds.length) return result
    const placeholders = entityIds.map(() => "?").join(",")
    const rows = db.prepare(
      `SELECT * FROM ArchiveLog
       WHERE entityType = ? AND entityId IN (${placeholders}) AND action = 'archive'
       ORDER BY performedAt DESC`
    ).all(entityType, ...entityIds) as ArchiveLogRow[]
    for (const row of rows) {
      if (!result.has(row.entityId)) result.set(row.entityId, row)
    }
    return result
  },
}
