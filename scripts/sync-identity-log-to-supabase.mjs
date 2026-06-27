/**
 * Copy identity switch audit log from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-identity-log
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

const rows = db.prepare("SELECT * FROM IdentitySwitchLog ORDER BY createdAt ASC").all()
console.log(`Syncing ${rows.length} identity switch log row(s)...`)

let failed = 0
for (const r of rows) {
  const { error } = await supabase.from("identity_switch_logs").upsert({
    id: r.id,
    action: r.action,
    real_user_id: r.realUserId,
    real_user_name: r.realUserName,
    target_user_id: r.targetUserId,
    target_user_name: r.targetUserName,
    detail: r.detail,
    created_at: r.createdAt,
  }, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${r.id}:`, error.message)
    failed++
  }
}

if (failed) {
  console.error(`\n✗ ${failed} error(s) — run supabase/migrations/009_identity_switch_logs.sql first`)
  process.exit(1)
}

console.log(failed === 0 && rows.length ? `\n✓ Synced ${rows.length} row(s)` : "\n✓ Identity log sync complete (nothing to sync)")
