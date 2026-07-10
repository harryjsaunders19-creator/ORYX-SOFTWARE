/**
 * One-time (or repeatable) sync: copy all clients + contacts from SQLite → Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/01-bootstrap.sql in Supabase SQL Editor
 *   2. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Usage:
 *   npm run supabase:sync-clients
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

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
    ...(r.archivedAt != null ? { archived_at: r.archivedAt } : {}),
    ...(r.archivedBy != null ? { archived_by: r.archivedBy } : {}),
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

const hasContactTable = db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ClientContact'",
).get()

let contactOk = 0
let contactFailed = 0

if (hasContactTable) {
  const contacts = db.prepare(
    "SELECT * FROM ClientContact ORDER BY clientId ASC, sortOrder ASC",
  ).all()
  console.log(`\nFound ${contacts.length} client contact(s) in SQLite`)

  for (const c of contacts) {
    const payload = {
      id: c.id,
      client_id: c.clientId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      is_primary: c.isPrimary === 1,
      sort_order: c.sortOrder ?? 0,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }
    const { error } = await supabase.from("client_contacts").upsert(payload, { onConflict: "id" })
    if (error) {
      console.error(`  ✗ contact ${c.name} (${c.clientId}):`, error.message)
      contactFailed++
    } else {
      contactOk++
    }
  }
  console.log(`Contacts: ${contactOk} synced, ${contactFailed} failed`)
} else {
  console.log("\n(No ClientContact table in SQLite — skipping contacts)")
}

console.log(`\nDone: ${ok} clients synced, ${failed} client errors`)
const exitCode = failed > 0 || contactFailed > 0 ? 1 : 0
process.exit(exitCode)
