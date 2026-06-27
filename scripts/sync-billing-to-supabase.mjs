/**
 * Copy billing tables from SQLite → Supabase.
 *
 * Usage: npm run supabase:sync-billing
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

function dateOnly(val) {
  if (!val) return null
  return String(val).slice(0, 10)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

let failed = 0

const batches = db.prepare("SELECT * FROM BillingExportBatch ORDER BY createdAt ASC").all()
console.log(`Syncing ${batches.length} export batch(es)...`)
for (const b of batches) {
  const { error } = await supabase.from("billing_export_batches").upsert({
    id: b.id,
    batch_number: b.batchNumber,
    export_date: dateOnly(b.exportDate),
    exported_by: b.exportedBy,
    record_count: b.recordCount,
    notes: b.notes,
    created_at: b.createdAt,
  }, { onConflict: "id" })
  if (error) { console.error("  batch", b.batchNumber, error.message); failed++ }
  else console.log(`  ✓ batch ${b.batchNumber}`)
}

const handoffs = db.prepare("SELECT * FROM BillingHandoff ORDER BY createdAt ASC").all()
console.log(`\nSyncing ${handoffs.length} handoff(s)...`)
for (const h of handoffs) {
  const { error } = await supabase.from("billing_handoffs").upsert({
    id: h.id,
    source_job_id: h.sourceJobId,
    billing_event_type: h.billingEventType,
    drawing_number: h.drawingNumber,
    item_type: h.itemType,
    type_of_works: h.typeOfWorks,
    custom_type_description: h.customTypeDescription,
    client_company: h.clientCompany,
    address: h.address,
    designer: h.designer,
    quote_value: h.quoteValue,
    quote_reference: h.quoteReference,
    completion_date: dateOnly(h.completionDate),
    added_to_billing_queue_at: h.addedToBillingQueueAt,
    cleared_by_accounts_at: h.clearedByAccountsAt,
    cleared_by: h.clearedBy,
    export_batch_id: h.exportBatchId,
    notes: h.notes,
    created_at: h.createdAt,
    updated_at: h.updatedAt,
  }, { onConflict: "id" })
  if (error) { console.error("  handoff", h.drawingNumber, error.message); failed++ }
  else console.log(`  ✓ ${h.drawingNumber}`)
}

const snaps = db.prepare("SELECT * FROM BillingExportSnapshot ORDER BY createdAt ASC").all()
console.log(`\nSyncing ${snaps.length} snapshot(s)...`)
for (const s of snaps) {
  const { error } = await supabase.from("billing_export_snapshots").upsert({
    id: s.id,
    batch_id: s.batchId,
    handoff_id: s.handoffId,
    snapshot_json: s.snapshotJson,
    created_at: s.createdAt,
  }, { onConflict: "id" })
  if (error) { console.error("  snapshot", s.id, error.message); failed++ }
  else console.log(`  ✓ snapshot ${s.id.slice(0, 8)}…`)
}

console.log(failed ? `\nDone with ${failed} error(s)` : "\nDone — all billing data synced")
process.exit(failed > 0 ? 1 : 0)
