/**
 * Verify identity switch log migration.
 *
 * Usage: npm run supabase:verify-identity-log
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying identity switch log migration…\n")

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

const { error } = await supabase.from("identity_switch_logs").select("*", { count: "exact", head: true })
if (error) {
  console.error("✗ identity_switch_logs:", error.message)
  console.error("\n  Run supabase/migrations/009_identity_switch_logs.sql first.")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteN = db.prepare("SELECT COUNT(*) as n FROM IdentitySwitchLog").get().n
  const { count: sbN } = await supabase.from("identity_switch_logs").select("*", { count: "exact", head: true })
  console.log("✓ identity_switch_logs table exists")
  console.log(`  rows: SQLite ${sqliteN} | Supabase ${sbN ?? 0}`)
  if (sqliteN !== (sbN ?? 0)) {
    console.log("\n→ Run: npm run supabase:sync-identity-log")
  } else {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_IDENTITY_LOG === "true") {
  console.log("\n✓ SUPABASE_IDENTITY_LOG=true")
} else {
  console.log("\n→ Add SUPABASE_IDENTITY_LOG=true to .env.local and restart")
}
