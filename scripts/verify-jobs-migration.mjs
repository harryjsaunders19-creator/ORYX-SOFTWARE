/**
 * Verify the jobs table exists in Supabase and compare row counts with SQLite.
 *
 * Usage: npm run supabase:verify-jobs
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying jobs migration…\n")

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

const { error, count } = await supabase.from("jobs").select("*", { count: "exact", head: true })

if (error) {
  if (error.message.includes("does not exist") || error.code === "42P01") {
    console.error("✗ Table public.jobs does not exist yet")
    console.error("\n  Run supabase/migrations/002_jobs.sql in Supabase SQL Editor first.")
  } else {
    console.error("✗ Supabase error:", error.message)
  }
  process.exit(1)
}

console.log("✓ public.jobs table exists")
console.log(`✓ Supabase job count: ${count ?? 0}`)

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteCount = db.prepare("SELECT COUNT(*) as n FROM Job").get().n
  console.log(`✓ SQLite job count:   ${sqliteCount}`)
  if (sqliteCount > 0 && (count ?? 0) === 0) {
    console.log("\n→ Run: npm run supabase:sync-jobs")
  } else if (sqliteCount === (count ?? 0)) {
    console.log("\n✓ Counts match — ready to enable SUPABASE_JOBS=true")
  }
}

if (process.env.SUPABASE_JOBS === "true") {
  console.log("\n✓ SUPABASE_JOBS=true — job API routes read from Supabase")
} else {
  console.log("\n→ Add SUPABASE_JOBS=true to .env.local and restart npm run dev")
}
