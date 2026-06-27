/**
 * Verify billing migration.
 *
 * Usage: npm run supabase:verify-billing
 */
import { existsSync } from "fs"
import { join } from "path"
import { createRequire } from "module"
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, projectRoot } from "./load-env-local.mjs"

const require = createRequire(import.meta.url)

console.log("Verifying billing migration…\n")

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

for (const table of ["billing_handoffs", "billing_export_batches", "billing_export_snapshots"]) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true })
  if (error) {
    console.error(`✗ ${table}:`, error.message)
    console.error("\n  Run supabase/migrations/006_billing.sql first.")
    process.exit(1)
  }
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (existsSync(dbPath)) {
  const Database = require("better-sqlite3")
  const db = new Database(dbPath, { readonly: true })
  const sqliteH = db.prepare("SELECT COUNT(*) as n FROM BillingHandoff").get().n
  const sqliteB = db.prepare("SELECT COUNT(*) as n FROM BillingExportBatch").get().n
  const sqliteS = db.prepare("SELECT COUNT(*) as n FROM BillingExportSnapshot").get().n
  const { count: hCount } = await supabase.from("billing_handoffs").select("*", { count: "exact", head: true })
  const { count: bCount } = await supabase.from("billing_export_batches").select("*", { count: "exact", head: true })
  const { count: sCount } = await supabase.from("billing_export_snapshots").select("*", { count: "exact", head: true })
  console.log("✓ All billing tables exist")
  console.log(`  handoffs:  SQLite ${sqliteH} | Supabase ${hCount ?? 0}`)
  console.log(`  batches:   SQLite ${sqliteB} | Supabase ${bCount ?? 0}`)
  console.log(`  snapshots: SQLite ${sqliteS} | Supabase ${sCount ?? 0}`)
  if (sqliteH !== (hCount ?? 0) || sqliteB !== (bCount ?? 0) || sqliteS !== (sCount ?? 0)) {
    console.log("\n→ Run: npm run supabase:sync-billing")
  } else {
    console.log("\n✓ Counts match")
  }
}

if (process.env.SUPABASE_BILLING === "true") {
  console.log("\n✓ SUPABASE_BILLING=true")
} else {
  console.log("\n→ Add SUPABASE_BILLING=true to .env.local and restart")
}
