/** Backup job and audit table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type {
  BackupStatus,
  BackupTrigger,
  BackupJobRow,
  CreateBackupJobData,
  BackupAuditLogRow,
  CreateBackupAuditLogData,
} from "../backup-types"
import type { CreateBackupAuditLogData, CreateBackupJobData, BackupAuditLogRow, BackupJobRow } from "../backup-types"

export const backupJobDb = {
  create(data: CreateBackupJobData): BackupJobRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO BackupJob (id, status, trigger, triggeredBy, triggeredByName, folderName, startedAt, retryOfId, createdAt, updatedAt)
      VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.trigger, data.triggeredBy, data.triggeredByName, data.folderName, now, data.retryOfId ?? null, now, now)
    return this.findUnique(data.id)!
  },

  findUnique(id: string): BackupJobRow | null {
    return (db.prepare("SELECT * FROM BackupJob WHERE id = ?").get(id) as BackupJobRow) ?? null
  },

  findMany(opts: { take?: number } = {}): BackupJobRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM BackupJob ORDER BY createdAt DESC ${limit}`).all() as BackupJobRow[]
  },

  /** Most recent COMPLETED backup whose file hasn't been pruned — what
   *  "Download Latest Backup" actually means. */
  findLatestCompleted(): BackupJobRow | null {
    return (db.prepare(
      "SELECT * FROM BackupJob WHERE status = 'COMPLETED' AND fileDeletedAt IS NULL ORDER BY completedAt DESC LIMIT 1"
    ).get() as BackupJobRow) ?? null
  },

  markRunning(id: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET status = 'RUNNING', updatedAt = ? WHERE id = ?").run(now, id)
  },

  markCompleted(id: string, data: { durationMs: number; sizeBytes: number; checksum: string; rowCounts: Record<string, number> }) {
    const now = nowIso()
    db.prepare(`
      UPDATE BackupJob SET status = 'COMPLETED', completedAt = ?, durationMs = ?, sizeBytes = ?, checksum = ?, rowCountsJson = ?, updatedAt = ?
      WHERE id = ?
    `).run(now, data.durationMs, data.sizeBytes, data.checksum, JSON.stringify(data.rowCounts), now, id)
  },

  markFailed(id: string, errorMessage: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET status = 'FAILED', errorMessage = ?, completedAt = ?, updatedAt = ? WHERE id = ?")
      .run(errorMessage, now, now, id)
  },

  markFileDeleted(id: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET fileDeletedAt = ?, updatedAt = ? WHERE id = ?").run(now, now, id)
  },

  /** Completed backups beyond the retention count, oldest first — what
   *  the retention-cleanup job actually deletes the files for. Never
   *  deletes the BackupJob row itself, only flags fileDeletedAt later. */
  findBeyondRetention(keepCount: number): BackupJobRow[] {
    return db.prepare(`
      SELECT * FROM BackupJob
      WHERE status = 'COMPLETED' AND fileDeletedAt IS NULL
      ORDER BY completedAt DESC
    `).all().slice(keepCount) as BackupJobRow[]
  },
}

export const backupAuditDb = {
  log(data: CreateBackupAuditLogData): BackupAuditLogRow {
    const id = nanoid()
    const createdAt = nowIso()
    db.prepare(`
      INSERT INTO BackupAuditLog (id, action, backupId, userId, userName, detail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.action, data.backupId ?? null, data.userId, data.userName, data.detail ?? null, createdAt)
    return {
      id,
      action: data.action,
      backupId: data.backupId ?? null,
      userId: data.userId,
      userName: data.userName,
      detail: data.detail ?? null,
      createdAt,
    }
  },

  findMany(opts: { take?: number } = {}): BackupAuditLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM BackupAuditLog ORDER BY createdAt DESC ${limit}`).all() as BackupAuditLogRow[]
  },

  findForBackup(backupId: string): BackupAuditLogRow[] {
    return db.prepare("SELECT * FROM BackupAuditLog WHERE backupId = ? ORDER BY createdAt ASC").all(backupId) as BackupAuditLogRow[]
  },
}
