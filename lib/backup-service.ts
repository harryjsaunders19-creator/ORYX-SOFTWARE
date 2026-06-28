/**
 * lib/backup-service.ts
 *
 * Core backup/restore logic. Design constraints this was built around:
 *
 * - better-sqlite3 is fully synchronous — there's no async driver underneath
 *   to "await" for free. To avoid monopolizing the single Node event loop
 *   for the whole export, every table's rows are read via `.iterate()` (a
 *   cursor, not `.all()` — never materializes a whole table in memory at
 *   once) and the export yields back to the event loop after each table via
 *   `setImmediate`, so other requests get scheduled in between. This is the
 *   right-sized answer for this app's actual scale (a few thousand rows
 *   across ~20 tables) — if this app's data volume ever grew by orders of
 *   magnitude, the next real step would be moving this into a Node
 *   worker_thread with its own SQLite connection for genuine parallelism;
 *   that's a bigger change than this app's current size justifies.
 *
 * - No new npm dependency for streaming JSON — Node's fs.createWriteStream
 *   plus hand-written comma bookkeeping is enough for this shape of data and
 *   keeps the whole thing auditable in one file.
 *
 * - Restore runs with `PRAGMA foreign_keys = OFF` for the bulk
 *   delete+reinsert, then re-enables it and runs `PRAGMA foreign_key_check`
 *   to verify integrity afterward. This sidesteps needing to hand-maintain a
 *   dependency-safe table order (Job's self-referential parentJobId alone
 *   makes that fiddly) without weakening the actual guarantee — by the time
 *   restore finishes, every FK must be valid or it fails loudly.
 */
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { db, type BackupTrigger, type BackupJobRow } from "@/lib/db"
import { backupRecordService } from "@/lib/services/backup-record-service"

export const BACKUPS_DIR =
  process.env.BACKUPS_DIR ??
  (process.env.VERCEL ? "/tmp/backups" : path.join(/*turbopackIgnore: true*/ process.cwd(), "backups"))
export const SCHEMA_VERSION = "2026.06"   // bump manually whenever a structural change would matter to a future restore
export const DEFAULT_RETENTION_COUNT = 30

function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

/** Every real, persistent table — enumerated from sqlite_master rather than
 *  hand-maintained, so a newly added table is automatically included without
 *  anyone needing to remember to update a list here. Excludes SQLite's own
 *  internal sqlite_* tables only. */
function listBackupTables(): string[] {
  return (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[]).map(r => r.name)
}

function folderNameFor(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `backup_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

/**
 * Streams every table to data.json as { "TableName": [rows...], ... },
 * computing a running sha256 over exactly the bytes written, and returns the
 * row counts and final hash. Never loads more than one table's worth of
 * rows-in-flight into memory (and even that is bounded by .iterate(), not a
 * single .all() — rows are written out as they're read).
 */
async function streamExportData(filePath: string): Promise<{ rowCounts: Record<string, number>; checksum: string; tables: string[] }> {
  const tables = listBackupTables()
  const rowCounts: Record<string, number> = {}
  const hash = crypto.createHash("sha256")
  const stream = fs.createWriteStream(filePath, { encoding: "utf8" })

  const write = (chunk: string) => {
    hash.update(chunk)
    return new Promise<void>((resolve, reject) => {
      stream.write(chunk, (err: Error | null | undefined) => err ? reject(err) : resolve())
    })
  }

  await write("{\n")
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t]
    await write(`${JSON.stringify(table)}: [`)
    let count = 0
    let first = true
    const cursor = db.prepare(`SELECT * FROM "${table}"`).iterate()
    let rowsSinceYield = 0
    for (const row of cursor) {
      await write(`${first ? "" : ","}\n  ${JSON.stringify(row)}`)
      first = false
      count++
      rowsSinceYield++
      // Yield periodically *within* a large table too, not just between
      // tables — a single table with tens of thousands of rows shouldn't
      // monopolize the event loop for its whole duration either.
      if (rowsSinceYield >= 500) {
        rowsSinceYield = 0
        await yieldToEventLoop()
      }
    }
    await write(first ? "]" : "\n]")
    rowCounts[table] = count
    await write(t < tables.length - 1 ? ",\n" : "\n")
    await yieldToEventLoop()
  }
  await write("}\n")

  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null | undefined) => err ? reject(err) : resolve())
  })

  return { rowCounts, checksum: hash.digest("hex"), tables }
}

function writeJsonFile(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

interface RunBackupOpts {
  jobId: string
  triggeredBy: string
  triggeredByName: string
  trigger: BackupTrigger
}

/**
 * Performs the actual backup work for an already-created (PENDING)
 * BackupJob row. Intended to be called *without* awaiting it from the API
 * route — the route returns immediately once the row exists; this function
 * updates that same row's status as it progresses, which is how the admin
 * UI's polling sees PENDING -> RUNNING -> COMPLETED/FAILED.
 */
export async function runBackup(opts: RunBackupOpts): Promise<void> {
  const { jobId, triggeredBy, triggeredByName, trigger } = opts
  const startedAt = Date.now()
  const job = await backupRecordService.findUnique(jobId)
  if (!job) return // shouldn't happen — created moments earlier by the caller

  const folderPath = path.join(BACKUPS_DIR, job.folderName)

  try {
    await backupRecordService.markRunning(jobId)
    fs.mkdirSync(BACKUPS_DIR, { recursive: true })
    fs.mkdirSync(folderPath, { recursive: true })

    const dataPath = path.join(folderPath, "data.json")
    const { rowCounts, checksum, tables } = await streamExportData(dataPath)
    const sizeBytes = fs.statSync(dataPath).size

    const manifest = {
      generatedAt: new Date().toISOString(),
      tables,
      rowCounts,
      totalRows: Object.values(rowCounts).reduce((a, b) => a + b, 0),
      dataFile: "data.json",
      checksumAlgorithm: "sha256",
      checksum,
      sizeBytes,
    }
    writeJsonFile(path.join(folderPath, "manifest.json"), manifest)

    const pkg = JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "package.json"), "utf8")) as { version?: string }
    const metadata = {
      backupId: jobId,
      appVersion: pkg.version ?? "unknown",
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      trigger,
      triggeredBy: { id: triggeredBy, name: triggeredByName },
    }
    writeJsonFile(path.join(folderPath, "metadata.json"), metadata)

    const durationMs = Date.now() - startedAt
    await backupRecordService.markCompleted(jobId, { durationMs, sizeBytes, checksum, rowCounts })
    await backupRecordService.logAudit({ action: "CREATE_COMPLETED", backupId: jobId, userId: triggeredBy, userName: triggeredByName, detail: `${manifest.totalRows} rows across ${tables.length} tables in ${durationMs}ms` })

    await runRetentionCleanup(triggeredBy, triggeredByName)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[runBackup] Backup ${jobId} failed:`, err)
    await backupRecordService.markFailed(jobId, message)
    await backupRecordService.logAudit({ action: "CREATE_FAILED", backupId: jobId, userId: triggeredBy, userName: triggeredByName, detail: message })
  }
}

/**
 * Creates the BackupJob row and kicks off the work. Deliberately does NOT
 * await runBackup() — callers (the API route) get the row back immediately
 * and the admin UI polls/refreshes to watch status progress. This is the
 * "asynchronous, non-blocking" requirement in its simplest honest form for a
 * single-process app: the HTTP response isn't held open for the duration of
 * the export.
 */
export async function startBackup(opts: { triggeredBy: string; triggeredByName: string; trigger: BackupTrigger; retryOfId?: string }) {
  const id = crypto.randomUUID()
  const folderName = folderNameFor(new Date())
  const job = await backupRecordService.create({
    id, folderName, trigger: opts.trigger,
    triggeredBy: opts.triggeredBy, triggeredByName: opts.triggeredByName,
    retryOfId: opts.retryOfId ?? null,
  })
  await backupRecordService.logAudit({ action: "CREATE_TRIGGERED", backupId: id, userId: opts.triggeredBy, userName: opts.triggeredByName, detail: opts.trigger })
  // Fire and forget — see function comment above.
  void runBackup({ jobId: id, triggeredBy: opts.triggeredBy, triggeredByName: opts.triggeredByName, trigger: opts.trigger })
  return job
}

export function backupFolderPath(job: BackupJobRow): string {
  return path.join(BACKUPS_DIR, job.folderName)
}

export function backupDataFilePath(job: BackupJobRow): string {
  return path.join(backupFolderPath(job), "data.json")
}

/**
 * Deletes the on-disk files for completed backups beyond the retention
 * count (oldest first) — never deletes the BackupJob row, which stays as a
 * permanent record (fileDeletedAt marks when its file was pruned). Runs
 * automatically after every successful backup; safe to call any time.
 */
export async function runRetentionCleanup(actorId: string, actorName: string, keepCount: number = DEFAULT_RETENTION_COUNT): Promise<number> {
  const toPrune = await backupRecordService.findBeyondRetention(keepCount)
  for (const job of toPrune) {
    try {
      fs.rmSync(backupFolderPath(job), { recursive: true, force: true })
      await backupRecordService.markFileDeleted(job.id)
    } catch (err) {
      console.error(`[runRetentionCleanup] Failed to prune backup ${job.id}:`, err)
    }
  }
  if (toPrune.length) {
    await backupRecordService.logAudit({ action: "RETENTION_CLEANUP", userId: actorId, userName: actorName, detail: `Pruned ${toPrune.length} backup file(s) beyond the last ${keepCount}` })
  }
  return toPrune.length
}
