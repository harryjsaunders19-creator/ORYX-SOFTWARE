/**
 * Verify employee + leave tables in Supabase and compare row counts with SQLite.
 *
 * Usage: npm run supabase:verify-hr
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying HR (employees + leave) migration…\n")

if (!loadEnvLocal()) {
  console.error("✗ .env.local not found")
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !serviceKey) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const HR_TABLES = [
  { name: "employee_profiles", sqlite: "EmployeeProfile", migration: "014_employees.sql" },
  { name: "leave_requests", sqlite: "LeaveRequest", migration: "015_leave.sql" },
]

let failed = 0

for (const { name, sqlite, migration } of HR_TABLES) {
  const { error, count } = await supabase.from(name).select("*", { count: "exact", head: true })
  if (error) {
    failed++
    console.error(`✗ public.${name} — ${error.message}`)
    console.error(`  Run supabase/migrations/${migration}`)
    continue
  }
  console.log(`✓ public.${name} exists — ${count ?? 0} row(s)`)

  const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
  if (existsSync(dbPath)) {
    const Database = require("better-sqlite3")
    const db = new Database(dbPath, { readonly: true })
    try {
      const sqliteCount = db.prepare(`SELECT COUNT(*) as n FROM ${sqlite}`).get().n
      console.log(`  SQLite ${sqlite}: ${sqliteCount}`)
      if (sqliteCount > 0 && (count ?? 0) === 0) {
        console.log(`  → Run npm run supabase:sync-hr`)
      }
    } catch {
      console.log(`  (SQLite table ${sqlite} not found — skip count)`)
    }
  }
}

if (failed > 0) process.exit(1)

console.log("\n✓ HR tables ready")
if (process.env.SUPABASE_EMPLOYEES === "false") {
  console.log("→ SUPABASE_EMPLOYEES=false — employees module uses SQLite")
}
if (process.env.SUPABASE_LEAVE === "false") {
  console.log("→ SUPABASE_LEAVE=false — leave module uses SQLite")
}
