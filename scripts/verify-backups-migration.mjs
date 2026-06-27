/**
 * Verify backup migration.
 *
 * Usage: npm run supabase:verify-backups
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying backup migration…\n")

if (!loadEnvLocal()) {
  console.error("✗ .env.local not found")
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !serviceKey) {
  console.error("✗ Missing Supabase env vars")
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

for (const table of ["backup_jobs", "backup_audit_logs"]) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true })
  if (error) {
    console.error(`✗ ${table}:`, error.message)
    console.error("\n  Run supabase/migrations/010_backups.sql first.")
    process.exit(1)
  }
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteJ = db.prepare("SELECT COUNT(*) as n FROM BackupJob").get().n
  const sqliteA = db.prepare("SELECT COUNT(*) as n FROM BackupAuditLog").get().n
  const { count: jCount } = await supabase.from("backup_jobs").select("*", { count: "exact", head: true })
  const { count: aCount } = await supabase.from("backup_audit_logs").select("*", { count: "exact", head: true })
  console.log("✓ All backup tables exist")
  console.log(`  jobs:      SQLite ${sqliteJ} | Supabase ${jCount ?? 0}`)
  console.log(`  audit log: SQLite ${sqliteA} | Supabase ${aCount ?? 0}`)
  if (sqliteJ !== (jCount ?? 0) || sqliteA !== (aCount ?? 0)) {
    console.log("\n→ Run: npm run supabase:sync-backups")
  } else {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_BACKUPS === "true") {
  console.log("\n✓ SUPABASE_BACKUPS=true")
} else {
  console.log("\n→ Add SUPABASE_BACKUPS=true to .env.local and restart")
}
