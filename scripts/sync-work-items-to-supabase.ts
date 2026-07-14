/**
 * Sync parent_jobs + work_items (+ FK remap columns) from SQLite → Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/migrations/030_parent_jobs_work_items.sql
 *   2. npm run migrate:work-items (local backfill)
 *   3. Service role key in .env.local
 *
 * Usage: npm run supabase:sync-work-items
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
  console.error("SQLite database not found at", dbPath)
  process.exit(1)
}

function dateOnly(val: unknown): string | null {
  if (!val) return null
  return String(val).slice(0, 10)
}

const Database = require("better-sqlite3")
const db = new Database(dbPath, { readonly: true })
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const parents = db.prepare("SELECT * FROM ParentJob ORDER BY createdAt ASC").all() as Record<string, unknown>[]
const workItems = db.prepare("SELECT * FROM WorkItem ORDER BY createdAt ASC").all() as Record<string, unknown>[]
const idMap = db.prepare("SELECT * FROM WorkItemIdMap").all() as Record<string, unknown>[]

console.log(`Syncing ${parents.length} parent job(s), ${workItems.length} work item(s)…`)

let failed = 0

for (const r of parents) {
  const payload = {
    id: r.id,
    drawing_number: r.drawingNumber,
    client_id: r.clientId,
    client_company: r.clientCompany,
    site_name: r.siteName,
    site_address: r.siteAddress,
    address: r.address,
    type_of_works: r.typeOfWorks,
    custom_type_description: r.customTypeDescription,
    legacy_type_of_works: r.legacyTypeOfWorks,
    description: r.description,
    requested_by: r.requestedBy,
    item_type: r.itemType,
    archived_at: r.archivedAt,
    archived_by: r.archivedBy,
    latitude: r.latitude,
    longitude: r.longitude,
    geocoded_at: r.geocodedAt,
    geocoded_address: r.geocodedAddress,
    location_status: r.locationStatus,
    location_source: r.locationSource,
    legacy_job_id: r.legacyJobId,
    migrated_at: r.migratedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }
  const { error } = await supabase.from("parent_jobs").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ parent ${r.drawingNumber}:`, error.message)
    failed++
  }
}

for (const r of workItems) {
  const payload = {
    id: r.id,
    parent_job_id: r.parentJobId,
    work_type: r.workType,
    revision_letter: r.revisionLetter,
    title: r.title,
    description: r.description,
    status: r.status,
    designer: r.designer ?? "",
    priority: r.priority,
    billable: r.billable === 1 || r.billable === true,
    requested_date: dateOnly(r.requestedDate),
    required_by_date: dateOnly(r.requiredByDate),
    notes: r.notes,
    commercial_notes: r.commercialNotes,
    quote_value: r.quoteValue,
    quote_reference: r.quoteReference,
    quote_date: dateOnly(r.quoteDate),
    variation_fees: r.variationFees,
    additional_charges: r.additionalCharges,
    invoice_status: r.invoiceStatus,
    invoice_number: r.invoiceNumber,
    invoice_date: dateOnly(r.invoiceDate),
    billed_value: r.billedValue,
    date_created: r.dateCreated,
    completed_at: dateOnly(r.completedAt),
    legacy_job_id: r.legacyJobId,
    migrated_at: r.migratedAt,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  }
  const { error } = await supabase.from("work_items").upsert(payload, { onConflict: "id" })
  if (error) {
    console.error(`  ✗ work item ${r.id}:`, error.message)
    failed++
  }
}

for (const r of idMap) {
  const { error } = await supabase.from("work_item_id_map").upsert({
    legacy_job_id: r.legacyJobId,
    work_item_id: r.workItemId,
    parent_job_id: r.parentJobId,
    migrated_at: r.migratedAt,
  }, { onConflict: "legacy_job_id" })
  if (error) {
    console.error(`  ✗ map ${r.legacyJobId}:`, error.message)
    failed++
  }
}

// Remap status_history work_item_id
const historyRows = db.prepare(
  "SELECT id, workItemId FROM StatusHistory WHERE workItemId IS NOT NULL",
).all() as { id: string; workItemId: string }[]

for (const row of historyRows) {
  const { error } = await supabase
    .from("status_history")
    .update({ work_item_id: row.workItemId })
    .eq("id", row.id)
  if (error) failed++
}

const handoffRows = db.prepare(
  "SELECT id, sourceWorkItemId FROM BillingHandoff WHERE sourceWorkItemId IS NOT NULL",
).all() as { id: string; sourceWorkItemId: string }[]

for (const row of handoffRows) {
  const { error } = await supabase
    .from("billing_handoffs")
    .update({ source_work_item_id: row.sourceWorkItemId })
    .eq("id", row.id)
  if (error) failed++
}

const quoteRows = db.prepare(
  "SELECT id, parentJobId FROM Quote WHERE parentJobId IS NOT NULL",
).all() as { id: string; parentJobId: string }[]

for (const row of quoteRows) {
  const { error } = await supabase
    .from("quotes")
    .update({ parent_job_id: row.parentJobId })
    .eq("id", row.id)
  if (error) failed++
}

const calRows = db.prepare(
  "SELECT id, workItemId FROM CalendarEvent WHERE workItemId IS NOT NULL",
).all() as { id: string; workItemId: string }[]

for (const row of calRows) {
  const { error } = await supabase
    .from("calendar_events")
    .update({ work_item_id: row.workItemId })
    .eq("id", row.id)
  if (error) failed++
}

console.log(failed === 0
  ? "\nDone — all rows synced."
  : `\nDone with ${failed} error(s).`)
process.exit(failed > 0 ? 1 : 0)
