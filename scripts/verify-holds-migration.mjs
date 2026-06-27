/**
 * Verify client_holds migration.
 *
 * Usage: npm run supabase:verify-holds
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying client holds migration…\n")

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

const { error, count } = await supabase.from("client_holds").select("*", { count: "exact", head: true })
if (error) {
  console.error("✗ client_holds table:", error.message)
  console.error("\n  Run supabase/migrations/005_client_holds.sql first.")
  process.exit(1)
}

console.log("✓ public.client_holds table exists")
console.log(`✓ Supabase row count: ${count ?? 0}`)

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteCount = db.prepare("SELECT COUNT(*) as n FROM ClientHold").get().n
  const activeCount = db.prepare("SELECT COUNT(*) as n FROM ClientHold WHERE status = 'ACTIVE'").get().n
  console.log(`✓ SQLite row count:   ${sqliteCount} (${activeCount} active)`)
  if (sqliteCount > 0 && (count ?? 0) === 0) {
    console.log("\n→ Run: npm run supabase:sync-holds")
  } else if (sqliteCount === (count ?? 0)) {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_HOLDS === "true") {
  console.log("\n✓ SUPABASE_HOLDS=true")
} else {
  console.log("\n→ Add SUPABASE_HOLDS=true to .env.local and restart")
}
