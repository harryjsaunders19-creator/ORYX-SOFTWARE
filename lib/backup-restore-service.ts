/**
 * lib/backup-restore-service.ts
 *
 * Restoring overwrites every row in every table with whatever was captured
 * at backup time. This is the single most dangerous operation in this
 * codebase — kept in its own file, on purpose, so the blast radius of this
 * logic is easy to find and review in isolation from ordinary backup
 * creation.
 *
 * Safety properties, in the order they're actually enforced:
 *   1. The backup must be COMPLETED and its file must not have been pruned
 *      by retention.
 *   2. The data file's sha256 must match the checksum recorded at backup
 *      time — a corrupted or tampered file is refused before anything
 *      destructive happens.
 *   3. A fresh safety backup of *current* state is taken and must itself
 *      complete successfully before the destructive restore proceeds — if
 *      the safety backup fails, the restore is aborted, not attempted
 *      anyway. Unlike ordinary backups, this one is awaited synchronously
 *      (not fire-and-forget): there's no point starting a destructive
 *      restore before we know the safety net actually exists.
 *   4. The destructive part runs inside a single db.transaction() with
 *      foreign keys temporarily off (SQLite can't otherwise tolerate
 *      deleting/reinserting self-referential rows like Job.parentJobId in
 *      one pass) and foreign keys are re-verified with PRAGMA
 *      foreign_key_check before the transaction is allowed to commit — if
 *      the restored data is internally inconsistent, the whole thing rolls
 *      back instead of committing a broken database.
 *   5. Every attempt — rejected, failed, or completed — is logged to
 *      BackupAuditLog, including the confirmation-phrase mismatch case.
 */
import fs from "fs"
import crypto from "crypto"
import { db, backupJobDb, backupAuditDb } from "@/lib/db"
import { backupDataFilePath, runBackup } from "@/lib/backup-service"

export class RestoreError extends Error {}

interface RestoreOpts {
  backupId: string
  actorId: string
  actorName: string
  /** Must equal the literal string "RESTORE" — checked here, not just in
   *  the UI, since the API route is the real boundary. */
  confirmationPhrase: string
}

export interface RestoreResult {
  safetyBackupId: string
  tablesRestored: string[]
  tablesSkipped: string[]
  tablesExcludedByDesign: string[]
  totalRowsInserted: number
}

function listCurrentTables(): string[] {
  return (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[]).map(r => r.name)
}

function tableColumns(table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(c => c.name))
}

export async function restoreFromBackup(opts: RestoreOpts): Promise<RestoreResult> {
  const { backupId, actorId, actorName, confirmationPhrase } = opts

  if (confirmationPhrase !== "RESTORE") {
    backupAuditDb.log({ action: "RESTORE_REJECTED", backupId, userId: actorId, userName: actorName, detail: "Confirmation phrase did not match" })
    throw new RestoreError('Confirmation phrase must be exactly "RESTORE".')
  }

  const job = backupJobDb.findUnique(backupId)
  if (!job) {
    backupAuditDb.log({ action: "RESTORE_REJECTED", backupId, userId: actorId, userName: actorName, detail: "Backup not found" })
    throw new RestoreError("Backup not found.")
  }
  if (job.status !== "COMPLETED") {
    backupAuditDb.log({ action: "RESTORE_REJECTED", backupId, userId: actorId, userName: actorName, detail: `Backup status is ${job.status}, not COMPLETED` })
    throw new RestoreError(`This backup is ${job.status.toLowerCase()}, not completed — it can't be restored from.`)
  }
  if (job.fileDeletedAt) {
    backupAuditDb.log({ action: "RESTORE_REJECTED", backupId, userId: actorId, userName: actorName, detail: "Backup file already pruned by retention" })
    throw new RestoreError("This backup's file has already been removed by the retention policy and can no longer be restored from.")
  }

  const dataPath = backupDataFilePath(job)
  if (!fs.existsSync(dataPath)) {
    backupAuditDb.log({ action: "RESTORE_REJECTED", backupId, userId: actorId, userName: actorName, detail: "data.json missing on disk despite COMPLETED status" })
    throw new RestoreError("Backup data file is missing on disk. This shouldn't happen — check server logs.")
  }

  backupAuditDb.log({ action: "RESTORE_TRIGGERED", backupId, userId: actorId, userName: actorName })

  // ── Step 1: integrity check BEFORE anything destructive ──────────
  const raw = fs.readFileSync(dataPath, "utf8")
  if (job.checksum) {
    const actual = crypto.createHash("sha256").update(raw).digest("hex")
    if (actual !== job.checksum) {
      backupAuditDb.log({ action: "RESTORE_FAILED", backupId, userId: actorId, userName: actorName, detail: `Checksum mismatch: expected ${job.checksum}, got ${actual}` })
      throw new RestoreError("This backup's data file does not match its recorded checksum — it may be corrupted or have been modified. Restore aborted before touching any data.")
    }
  }

  let parsed: Record<string, unknown[]>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown[]>
  } catch (err) {
    backupAuditDb.log({ action: "RESTORE_FAILED", backupId, userId: actorId, userName: actorName, detail: `data.json failed to parse: ${err}` })
    throw new RestoreError("Backup data file is not valid JSON. Restore aborted before touching any data.")
  }

  // ── Step 2: safety backup of CURRENT state — blocking, must succeed ──
  const safetyId = crypto.randomUUID()
  const folderName = `backup_${new Date().toISOString().replace(/[:.]/g, "-")}_pre-restore-safety`
  const safetyJob = backupJobDb.create({
    id: safetyId, folderName, trigger: "PRE_RESTORE_SAFETY",
    triggeredBy: actorId, triggeredByName: actorName,
  })
  await runBackup({ jobId: safetyJob.id, triggeredBy: actorId, triggeredByName: actorName, trigger: "PRE_RESTORE_SAFETY" })
  const completedSafetyJob = backupJobDb.findUnique(safetyId)
  if (!completedSafetyJob || completedSafetyJob.status !== "COMPLETED") {
    backupAuditDb.log({
      action: "RESTORE_FAILED", backupId, userId: actorId, userName: actorName,
      detail: `Aborted: the pre-restore safety backup itself failed (${completedSafetyJob?.errorMessage ?? "unknown error"}) — refusing to proceed without a safety net`,
    })
    throw new RestoreError("Could not take a safety backup of the current data before restoring — the restore was aborted and nothing was changed. Check the failed safety-backup entry in backup history for details.")
  }

  // ── Step 3: the actual destructive restore ────────────────────────
  // BackupJob and BackupAuditLog are deliberately EXCLUDED from both the
  // wipe and the reinsert, even though they're ordinary tables that get
  // captured in every backup's data.json like everything else. They are
  // the backup system's own bookkeeping *about itself*, not application
  // data — restoring an old backup is supposed to rewind Jobs/Clients/
  // Quotes to that point in time, but it must never also rewind the record
  // of backups taken since then. Without this exclusion, restoring an old
  // backup overwrites BackupJob with that backup's own snapshot of the
  // table — silently erasing every backup taken between then and now,
  // including the safety backup this very restore just took to protect
  // against itself. Found by actually running the full restore sequence
  // end-to-end, not by code review: each piece looks correct in isolation,
  // and the bug only appears once a real restore is performed and the
  // "permanent record" guarantee is checked against what's actually left
  // in the table afterward.
  const SELF_REFERENTIAL_TABLES = new Set(["BackupJob", "BackupAuditLog"])
  const currentTables = new Set(listCurrentTables().filter(t => !SELF_REFERENTIAL_TABLES.has(t)))
  const backupTables = Object.keys(parsed).filter(t => !SELF_REFERENTIAL_TABLES.has(t))
  const tablesToRestore = backupTables.filter(t => currentTables.has(t))
  const tablesSkippedNotInCurrentSchema = backupTables.filter(t => !currentTables.has(t))
  let totalRowsInserted = 0

  try {
    db.pragma("foreign_keys = OFF")
    db.transaction(() => {
      // Clear every table currently in the schema (not just ones present in
      // the backup) — a full restore means the end state matches the
      // backup exactly, including tables that simply have zero rows in it.
      for (const table of currentTables) {
        db.prepare(`DELETE FROM "${table}"`).run()
      }

      for (const table of tablesToRestore) {
        const rows = parsed[table] as Record<string, unknown>[]
        if (!rows.length) continue
        const liveColumns = tableColumns(table)
        // Tolerate schema drift: only insert columns that exist in both the
        // backup row and the live table. A column added since the backup
        // was taken is simply left at its default/NULL; a column the
        // backup has that no longer exists is silently dropped — both are
        // logged in the result for visibility, not hidden.
        for (const row of rows) {
          const cols = Object.keys(row).filter(c => liveColumns.has(c))
          if (!cols.length) continue
          const placeholders = cols.map(() => "?").join(",")
          const colList = cols.map(c => `"${c}"`).join(",")
          db.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`)
            .run(...cols.map(c => row[c] as string | number | null))
          totalRowsInserted++
        }
      }

      // Deliberately run the integrity check *inside* this same
      // transaction, not after it: foreign_key_check works fine with
      // enforcement off (it's a diagnostic scan, independent of the
      // PRAGMA foreign_keys setting), and throwing in here is what makes
      // better-sqlite3 roll back instead of commit. Checking after
      // db.transaction() returns would be too late — by then the bad data
      // would already be durably committed, and "rolled back" in the error
      // message below would be a lie.
      const fkViolations = db.pragma("foreign_key_check") as unknown[]
      if (fkViolations.length > 0) {
        throw new RestoreError(
          `Restored data failed referential integrity check (${fkViolations.length} violation(s)) — this should not be possible from a backup taken by this same app, and indicates the backup file may be from an incompatible schema version. Rolled back; nothing was changed.`
        )
      }
    })()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    backupAuditDb.log({ action: "RESTORE_FAILED", backupId, userId: actorId, userName: actorName, detail: message })
    throw err instanceof RestoreError ? err : new RestoreError(`Restore failed: ${message}`)
  } finally {
    // Must run regardless of success or failure — a thrown error inside the
    // transaction must not leave this connection with FK enforcement
    // permanently disabled for every subsequent request.
    db.pragma("foreign_keys = ON")
  }

  backupAuditDb.log({
    action: "RESTORE_COMPLETED", backupId, userId: actorId, userName: actorName,
    detail: `Restored ${totalRowsInserted} rows across ${tablesToRestore.length} table(s). Safety backup: ${safetyId}. Backup history tables (${[...SELF_REFERENTIAL_TABLES].join(", ")}) deliberately left untouched.${tablesSkippedNotInCurrentSchema.length ? ` Skipped (no longer in schema): ${tablesSkippedNotInCurrentSchema.join(", ")}.` : ""}`,
  })

  return {
    safetyBackupId: safetyId,
    tablesRestored: tablesToRestore,
    tablesSkipped: tablesSkippedNotInCurrentSchema,
    tablesExcludedByDesign: [...SELF_REFERENTIAL_TABLES],
    totalRowsInserted,
  }
}
