/**
 * Verify calendar migration.
 *
 * Usage: npm run supabase:verify-calendar
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying calendar migration…\n")

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

for (const table of ["event_categories", "calendar_events", "calendar_assignments"]) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true })
  if (error) {
    console.error(`✗ ${table}:`, error.message)
    console.error("\n  Run supabase/migrations/007_calendar.sql first.")
    process.exit(1)
  }
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteC = db.prepare("SELECT COUNT(*) as n FROM EventCategory").get().n
  const sqliteE = db.prepare("SELECT COUNT(*) as n FROM CalendarEvent").get().n
  const sqliteA = db.prepare("SELECT COUNT(*) as n FROM CalendarAssignment").get().n
  const { count: cCount } = await supabase.from("event_categories").select("*", { count: "exact", head: true })
  const { count: eCount } = await supabase.from("calendar_events").select("*", { count: "exact", head: true })
  const { count: aCount } = await supabase.from("calendar_assignments").select("*", { count: "exact", head: true })
  console.log("✓ All calendar tables exist")
  console.log(`  categories:  SQLite ${sqliteC} | Supabase ${cCount ?? 0}`)
  console.log(`  events:      SQLite ${sqliteE} | Supabase ${eCount ?? 0}`)
  console.log(`  assignments: SQLite ${sqliteA} | Supabase ${aCount ?? 0}`)
  if (sqliteE !== (eCount ?? 0) || sqliteA !== (aCount ?? 0)) {
    console.log("\n→ Run: npm run supabase:sync-calendar")
  } else {
    console.log("\n✓ Event counts match")
  }
}

if (process.env.SUPABASE_CALENDAR === "true") {
  console.log("\n✓ SUPABASE_CALENDAR=true")
} else {
  console.log("\n→ Add SUPABASE_CALENDAR=true to .env.local and restart")
}
