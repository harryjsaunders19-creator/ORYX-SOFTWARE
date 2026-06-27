/**
 * Verify users migration.
 *
 * Usage: npm run supabase:verify-users
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying users migration…\n")

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

const { error } = await supabase.from("app_users").select("*", { count: "exact", head: true })
if (error) {
  console.error("✗ app_users:", error.message)
  console.error("\n  Run supabase/migrations/008_users.sql first.")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteN = db.prepare("SELECT COUNT(*) as n FROM User").get().n
  const withPassword = db.prepare("SELECT COUNT(*) as n FROM User WHERE passwordHash IS NOT NULL").get().n
  const { count: sbN } = await supabase.from("app_users").select("*", { count: "exact", head: true })
  const { count: sbPw } = await supabase.from("app_users").select("*", { count: "exact", head: true }).not("password_hash", "is", null)
  console.log("✓ app_users table exists")
  console.log(`  users:           SQLite ${sqliteN} | Supabase ${sbN ?? 0}`)
  console.log(`  with password:   SQLite ${withPassword} | Supabase ${sbPw ?? 0}`)
  if (sqliteN !== (sbN ?? 0)) {
    console.log("\n→ Run: npm run supabase:sync-users")
  } else {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_USERS === "true") {
  console.log("\n✓ SUPABASE_USERS=true")
} else {
  console.log("\n→ Add SUPABASE_USERS=true to .env.local and restart")
}
