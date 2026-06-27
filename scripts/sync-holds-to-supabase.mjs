/**
 * Copy all client holds from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-holds
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

const rows = db.prepare("SELECT * FROM ClientHold ORDER BY addedAt ASC").all()
console.log(`Found ${rows.length} client hold row(s) in SQLite`)

let ok = 0
let failed = 0

for (const r of rows) {
  const payload = {
    id: r.id,
    client_id: r.clientId,
    status: r.status,
    reason: r.reason,
    notes: r.notes,
    added_by: r.addedBy,
    added_at: r.addedAt,
    removed_by: r.removedBy,
    removed_at: r.removedAt,
    removed_reason: r.removedReason,
  }
  const { error } = await supabase.from("client_holds").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${r.id}:`, error.message)
    failed++
  } else {
    console.log(`  ✓ ${r.clientId} (${r.status})`)
    ok++
  }
}

console.log(`\nDone: ${ok} synced, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
