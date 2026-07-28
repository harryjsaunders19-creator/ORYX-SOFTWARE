/**
 * Copy app users from SQLite → Supabase (includes password_hash for login).
 *
 * Usage: npm run supabase:sync-users
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

const rows = db.prepare("SELECT * FROM User ORDER BY createdAt ASC").all()
console.log(`Syncing ${rows.length} user(s)...`)

let failed = 0
for (const u of rows) {
  let moduleAccessJson = null
  if (u.moduleAccessJson) {
    try { moduleAccessJson = JSON.parse(u.moduleAccessJson) }
    catch { moduleAccessJson = null }
  }
  const { error } = await supabase.from("app_users").upsert({
    id: u.id,
    name: u.name,
    email: u.email,
    email_lower: u.emailLower,
    role: u.role,
    active: u.active === 1,
    module_access_json: moduleAccessJson,
    password_hash: u.passwordHash,
    must_change_password: u.mustChangePassword === 1,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  }, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${u.email ?? u.name}:`, error.message)
    failed++
  } else {
    console.log(`  ✓ ${u.name}${u.email ? ` (${u.email})` : ""}`)
  }
}

if (failed) {
  console.error(`\n✗ ${failed} error(s) — run supabase/migrations/008_users.sql first`)
  process.exit(1)
}

console.log("\n✓ User sync complete")
