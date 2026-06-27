/**
 * Copy all status history from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-status-history
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
  console.error("Missing Supabase env vars in .env.local")
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

const rows = db.prepare("SELECT * FROM StatusHistory ORDER BY changedAt ASC").all()
console.log(`Found ${rows.length} status history row(s) in SQLite`)

let ok = 0
let failed = 0

for (const r of rows) {
  const payload = {
    id: r.id,
    job_id: r.jobId,
    from_status: r.fromStatus,
    to_status: r.toStatus,
    changed_by: r.changedBy,
    changed_at: r.changedAt,
    note: r.note,
  }
  const { error } = await supabase.from("status_history").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${r.id}:`, error.message)
    failed++
  } else {
    ok++
  }
}

console.log(`\nDone: ${ok} synced, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
