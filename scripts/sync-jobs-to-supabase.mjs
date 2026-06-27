/**
 * Copy all jobs from SQLite → Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/002_jobs.sql in Supabase SQL Editor
 *   2. Service role key in .env.local
 *
 * Usage: npm run supabase:sync-jobs
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}

const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")
if (!existsSync(dbPath)) {
  console.error("SQLite database not found at", dbPath, "— run npm run dev once first.")
  process.exit(1)
}

function dateOnly(val) {
  if (!val) return null
  return String(val).slice(0, 10)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const rows = db.prepare("SELECT * FROM Job ORDER BY dateCreated ASC").all()
console.log(`Found ${rows.length} job(s) in SQLite`)

let ok = 0
let failed = 0

for (const r of rows) {
  const payload = {
    id: r.id,
    drawing_number: r.drawingNumber,
    item_type: r.itemType,
    address: r.address,
    type_of_works: r.typeOfWorks,
    custom_type_description: r.customTypeDescription,
    legacy_type_of_works: r.legacyTypeOfWorks,
    client_company: r.clientCompany,
    client_id: r.clientId,
    requested_by: r.requestedBy,
    status: r.status,
    designer: r.designer ?? "",
    date_created: r.dateCreated,
    date_completed: dateOnly(r.dateCompleted),
    notes: r.notes,
    parent_job_id: r.parentJobId,
    revision_letter: r.revisionLetter,
    quote_value: r.quoteValue,
    quote_reference: r.quoteReference,
    quote_date: dateOnly(r.quoteDate),
    commercial_notes: r.commercialNotes,
    invoice_id: r.invoiceId,
    billing_status: r.billingStatus,
    billing_batch_id: r.billingBatchId,
    requested_date: dateOnly(r.requestedDate),
    required_by_date: dateOnly(r.requiredByDate),
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }

  const { error } = await supabase.from("jobs").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ ${r.drawingNumber}:`, error.message)
    if (error.message.includes("schema cache")) {
      console.error("     → Re-run 002_jobs.sql in Supabase SQL Editor, or Dashboard → Settings → API → Reload schema")
    }
    failed++
  } else {
    console.log(`  ✓ ${r.drawingNumber}`)
    ok++
  }
}

console.log(`\nDone: ${ok} synced, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
