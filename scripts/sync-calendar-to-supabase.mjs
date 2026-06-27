/**
 * Copy calendar tables from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-calendar
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

const categories = db.prepare("SELECT * FROM EventCategory ORDER BY name ASC").all()
console.log(`Syncing ${categories.length} categor(ies)...`)
for (const c of categories) {
  const { error } = await supabase.from("event_categories").upsert({
    id: c.id,
    name: c.name,
    color: c.color,
    icon: c.icon,
  }, { onConflict: "id" })
  if (error) { console.error("  category", c.name, error.message); failed++ }
  else console.log(`  ✓ ${c.name}`)
}

const events = db.prepare("SELECT * FROM CalendarEvent ORDER BY createdAt ASC").all()
console.log(`\nSyncing ${events.length} event(s)...`)
for (const e of events) {
  const { error } = await supabase.from("calendar_events").upsert({
    id: e.id,
    title: e.title,
    description: e.description,
    category_id: e.categoryId,
    start_date: e.startDate,
    end_date: e.endDate,
    all_day: e.allDay === 1,
    location: e.location,
    priority: e.priority,
    status: e.status,
    job_id: e.jobId,
    client_id: e.clientId,
    created_by: e.createdBy,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  }, { onConflict: "id" })
  if (error) { console.error("  event", e.title, error.message); failed++ }
  else console.log(`  ✓ ${e.title}`)
}

const assignments = db.prepare("SELECT * FROM CalendarAssignment ORDER BY eventId ASC").all()
console.log(`\nSyncing ${assignments.length} assignment(s)...`)
for (const a of assignments) {
  const { error } = await supabase.from("calendar_assignments").upsert({
    id: a.id,
    event_id: a.eventId,
    user_id: a.userId,
  }, { onConflict: "id" })
  if (error) { console.error("  assignment", a.id, error.message); failed++ }
}

if (failed) {
  console.error(`\n✗ ${failed} error(s) — run supabase/migrations/007_calendar.sql if tables are missing`)
  process.exit(1)
}

console.log("\n✓ Calendar sync complete")
