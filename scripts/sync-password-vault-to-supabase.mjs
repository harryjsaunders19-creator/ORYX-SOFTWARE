/**
 * Copy password vault entries from SQLite → Supabase.
 * Passwords remain AES-256-GCM encrypted (password_enc) — same ciphertext as SQLite.
 *
 * Usage: npm run supabase:sync-password-vault
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

let failed = 0

const rows = db.prepare("SELECT * FROM PasswordVaultEntry ORDER BY serviceNameLower ASC").all()
console.log(`Syncing ${rows.length} password vault entr${rows.length === 1 ? "y" : "ies"}...`)

for (const r of rows) {
  const { error } = await supabase.from("password_vault_entries").upsert({
    id: r.id,
    service_name: r.serviceName,
    service_name_lower: r.serviceNameLower,
    login_url: r.loginUrl,
    username: r.username,
    username_lower: r.usernameLower,
    password_enc: r.passwordEnc,
    category: r.category,
    category_lower: r.categoryLower,
    notes: r.notes,
    extra_json: r.extraJson,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${r.serviceName}:`, error.message)
    failed++
  } else {
    console.log(`  ✓ ${r.serviceName}`)
  }
}

if (failed) {
  console.error(`\n✗ ${failed} error(s) — run supabase/migrations/017_password_vault.sql first`)
  process.exit(1)
}

console.log("\n✓ Password vault sync complete")
