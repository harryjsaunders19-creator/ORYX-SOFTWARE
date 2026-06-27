/**
 * Verify status_history migration.
 *
 * Usage: npm run supabase:verify-status-history
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying status history migration…\n")

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

const { error, count } = await supabase.from("status_history").select("*", { count: "exact", head: true })
if (error) {
  console.error("✗ status_history table:", error.message)
  console.error("\n  Run supabase/migrations/004_status_history.sql first.")
  process.exit(1)
}

console.log("✓ public.status_history table exists")
console.log(`✓ Supabase row count: ${count ?? 0}`)

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteCount = db.prepare("SELECT COUNT(*) as n FROM StatusHistory").get().n
  console.log(`✓ SQLite row count:   ${sqliteCount}`)
  if (sqliteCount > 0 && (count ?? 0) === 0) {
    console.log("\n→ Run: npm run supabase:sync-status-history")
  } else if (sqliteCount === (count ?? 0)) {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_STATUS_HISTORY === "true") {
  console.log("\n✓ SUPABASE_STATUS_HISTORY=true")
} else {
  console.log("\n→ Add SUPABASE_STATUS_HISTORY=true to .env.local and restart")
}
