/** TypeOfWorksMigrationLog table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
export interface TypeOfWorksMigrationLogRow {
  id: string; jobId: string; drawingNumber: string
  originalValue: string; mappedTo: string; customDescription: string | null
  matchType: string; needsReview: number
  reviewedAt: string | null; reviewedBy: string | null
  migratedAt: string
}

export const typeOfWorksMigrationLogDb = {
  findMany(opts: { needsReview?: boolean } = {}): TypeOfWorksMigrationLogRow[] {
    const w = opts.needsReview !== undefined ? `WHERE needsReview = ${opts.needsReview ? 1 : 0}` : ""
    return db.prepare(`SELECT * FROM TypeOfWorksMigrationLog ${w} ORDER BY needsReview DESC, migratedAt DESC`).all() as TypeOfWorksMigrationLogRow[]
  },
  stats(): { total: number; needsReview: number; exact: number; alias: number; flagged: number } {
    const row = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) as needsReview,
             SUM(CASE WHEN matchType = 'EXACT' THEN 1 ELSE 0 END) as exact,
             SUM(CASE WHEN matchType = 'ALIAS' THEN 1 ELSE 0 END) as alias,
             SUM(CASE WHEN matchType = 'FLAGGED' THEN 1 ELSE 0 END) as flagged
      FROM TypeOfWorksMigrationLog
    `).get() as { total: number; needsReview: number; exact: number; alias: number; flagged: number }
    return row
  },
  /** Marks a flagged entry as reviewed — doesn't change the job itself (do
   *  that via the normal job-edit form if the mapping needs correcting),
   *  just closes the loop on "someone looked at this." */
  markReviewed(id: string, reviewedBy: string): TypeOfWorksMigrationLogRow | null {
    const existing = db.prepare("SELECT * FROM TypeOfWorksMigrationLog WHERE id = ?").get(id) as TypeOfWorksMigrationLogRow | undefined
    if (!existing) return null
    db.prepare("UPDATE TypeOfWorksMigrationLog SET needsReview = 0, reviewedAt = ?, reviewedBy = ? WHERE id = ?")
      .run(nowIso(), reviewedBy, id)
    return db.prepare("SELECT * FROM TypeOfWorksMigrationLog WHERE id = ?").get(id) as TypeOfWorksMigrationLogRow
  },
}
