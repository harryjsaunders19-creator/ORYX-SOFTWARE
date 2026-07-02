/**
 * Verify password vault migration.
 *
 * Usage: npm run supabase:verify-password-vault
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying password vault migration…\n")

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

const { error } = await supabase.from("password_vault_entries").select("*", { count: "exact", head: true })
if (error) {
  console.error("✗ password_vault_entries:", error.message)
  console.error("\n  Run supabase/migrations/017_password_vault.sql first.")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteN = db.prepare("SELECT COUNT(*) as n FROM PasswordVaultEntry").get().n
  const { count } = await supabase.from("password_vault_entries").select("*", { count: "exact", head: true })
  console.log("✓ password_vault_entries table exists")
  console.log(`  entries: SQLite ${sqliteN} | Supabase ${count ?? 0}`)
  if (sqliteN !== (count ?? 0)) {
    console.log("\n→ Run: npm run supabase:sync-password-vault")
  } else {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_PASSWORD_VAULT === "true") {
  console.log("\n✓ SUPABASE_PASSWORD_VAULT=true")
} else {
  console.log("\n→ Add SUPABASE_PASSWORD_VAULT=true to .env.local and restart")
}

if (!process.env.VAULT_ENCRYPTION_KEY?.trim()) {
  console.log("\n⚠ Set VAULT_ENCRYPTION_KEY in production (passwords use AES-256-GCM at rest)")
}
