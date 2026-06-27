/**
 * Verify the clients table exists in Supabase and compare row counts with SQLite.
 *
 * Usage:
 *   npm run supabase:verify-clients
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying clients migration…\n")

if (!loadEnvLocal()) {
  console.error("✗ .env.local not found")
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !serviceKey) {
  console.error("✗ Missing env vars:")
  if (!url) console.error("    NEXT_PUBLIC_SUPABASE_URL")
  if (!serviceKey) console.error("    SUPABASE_SERVICE_ROLE_KEY")
  console.error("\n  Service role key: Supabase Dashboard → Project Settings → API → service_role")
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error, count } = await supabase
  .from("clients")
  .select("*", { count: "exact", head: true })

if (error) {
  if (error.message.includes("does not exist") || error.code === "42P01") {
    console.error("✗ Table public.clients does not exist yet")
    console.error("\n  Run the SQL migration first:")
    console.error("    1. Open Supabase Dashboard → SQL Editor")
    console.error("    2. Paste contents of supabase/migrations/001_clients.sql")
    console.error("    3. Click Run")
    console.error("    4. Re-run: npm run supabase:verify-clients")
  } else {
    console.error("✗ Supabase error:", error.message)
  }
  process.exit(1)
}

console.log("✓ public.clients table exists")
console.log(`✓ Supabase client count: ${count ?? 0}`)

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteCount = db.prepare("SELECT COUNT(*) as n FROM Client").get().n
  console.log(`✓ SQLite client count:   ${sqliteCount}`)
  if (sqliteCount > 0 && (count ?? 0) === 0) {
    console.log("\n→ SQLite has clients but Supabase is empty. Run: npm run supabase:sync-clients")
  } else if (sqliteCount === (count ?? 0)) {
    console.log("\n✓ Counts match — ready to enable SUPABASE_CLIENTS=true")
  }
} else {
  console.log("  (SQLite DB not found — run npm run dev once to create it)")
}

if (process.env.SUPABASE_CLIENTS === "true") {
  console.log("\n✓ SUPABASE_CLIENTS=true — client API routes use Supabase")
} else {
  console.log("\n→ To switch client reads/writes to Supabase, add to .env.local:")
  console.log("    SUPABASE_CLIENTS=true")
  console.log("  Then restart npm run dev")
}
