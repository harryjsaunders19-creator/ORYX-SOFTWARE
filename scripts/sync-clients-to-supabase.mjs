/**
 * One-time (or repeatable) sync: copy all clients from SQLite → Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/001_clients.sql in Supabase SQL Editor
 *   2. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *      SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   node scripts/sync-clients-to-supabase.mjs
 */
import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (!existsSync(dbPath)) {
  console.error("SQLite database not found at", dbPath, "— run npm run dev once first.")
  process.exit(1)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const rows = db.prepare("SELECT * FROM Client ORDER BY name ASC").all()
console.log(`Found ${rows.length} client(s) in SQLite`)

let ok = 0
let failed = 0

for (const r of rows) {
  const payload = {
    id: r.id,
    name: r.name,
    name_lower: r.nameLower,
    contact_name: r.contactName,
    email: r.email,
    phone: r.phone,
    billing_address: r.billingAddress,
    notes: r.notes,
    account_code: r.accountCode,
    active: r.active === 1,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }

  const { error } = await supabase.from("clients").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${r.name}:`, error.message)
    failed++
  } else {
    console.log(`  ✓ ${r.name}`)
    ok++
  }
}

console.log(`\nDone: ${ok} synced, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
