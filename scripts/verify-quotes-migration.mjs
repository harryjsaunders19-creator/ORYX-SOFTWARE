/**
 * Verify quotes migration — table exists and counts match SQLite.
 *
 * Usage: npm run supabase:verify-quotes
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying quotes migration…\n")

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

const { error, count } = await supabase.from("quotes").select("*", { count: "exact", head: true })
if (error) {
  console.error("✗ quotes table:", error.message)
  console.error("\n  Run supabase/migrations/003_quotes.sql in Supabase SQL Editor first.")
  process.exit(1)
}

console.log("✓ public.quotes table exists")
console.log(`✓ Supabase quote count: ${count ?? 0}`)

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteCount = db.prepare("SELECT COUNT(*) as n FROM Quote").get().n
  console.log(`✓ SQLite quote count:   ${sqliteCount}`)
  if (sqliteCount > 0 && (count ?? 0) === 0) {
    console.log("\n→ Run: npm run supabase:sync-quotes")
  } else if (sqliteCount === (count ?? 0)) {
    console.log("\n✓ Counts match — ready for SUPABASE_QUOTES=true")
  }
}

if (process.env.SUPABASE_QUOTES === "true") {
  console.log("\n✓ SUPABASE_QUOTES=true — quote API routes read from Supabase")
} else {
  console.log("\n→ Add SUPABASE_QUOTES=true to .env.local and restart npm run dev")
}
