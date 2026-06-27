/**
 * Copy backup metadata from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-backups
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error("Missing Supabase env vars")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (!existsSync(dbPath)) {
  console.error("SQLite database not found")
  process.exit(1)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

let failed = 0

const jobs = db.prepare("SELECT * FROM BackupJob ORDER BY createdAt ASC").all()
console.log(`Syncing ${jobs.length} backup job(s)...`)
for (const j of jobs) {
  const { error } = await supabase.from("backup_jobs").upsert({
    id: j.id,
    status: j.status,
    trigger: j.trigger,
    triggered_by: j.triggeredBy,
    triggered_by_name: j.triggeredByName,
    folder_name: j.folderName,
    started_at: j.startedAt,
    completed_at: j.completedAt,
    duration_ms: j.durationMs,
    size_bytes: j.sizeBytes,
    checksum: j.checksum,
    row_counts_json: j.rowCountsJson,
    error_message: j.errorMessage,
    retry_of_id: j.retryOfId,
    file_deleted_at: j.fileDeletedAt,
    created_at: j.createdAt,
    updated_at: j.updatedAt,
  }, { onConflict: "id" })
  if (error) { console.error(`  ✗ ${j.folderName}:`, error.message); failed++ }
  else console.log(`  ✓ ${j.folderName}`)
}

const logs = db.prepare("SELECT * FROM BackupAuditLog ORDER BY createdAt ASC").all()
console.log(`\nSyncing ${logs.length} audit log row(s)...`)
for (const r of logs) {
  const { error } = await supabase.from("backup_audit_logs").upsert({
    id: r.id,
    action: r.action,
    backup_id: r.backupId,
    user_id: r.userId,
    user_name: r.userName,
    detail: r.detail,
    created_at: r.createdAt,
  }, { onConflict: "id" })
  if (error) { console.error(`  ✗ ${r.id}:`, error.message); failed++ }
}

if (failed) {
  console.error(`\n✗ ${failed} error(s) — run supabase/migrations/010_backups.sql first`)
  process.exit(1)
}

console.log("\n✓ Backup sync complete")
