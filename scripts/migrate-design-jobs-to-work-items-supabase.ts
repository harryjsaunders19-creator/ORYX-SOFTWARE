/**
 * Backfill design jobs → parent_jobs + work_items directly in Supabase.
 * Use when production data lives in Supabase (Vercel) rather than local SQLite.
 *
 * Prerequisites: 030_parent_jobs_work_items.sql applied.
 *
 * Usage:
 *   npm run migrate:work-items:supabase
 *   npm run migrate:work-items:supabase -- --dry-run
 *   npm run migrate:work-items:supabase -- --force
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal } from "./load-env-local.mjs"
import {
  planDesignJobMigration,
  validateMigrationPlan,
  type LegacyDesignJobRow,
  type LegacyHandoffRow,
} from "../lib/migrations/work-items-backfill"

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const force = args.has("--force")

async function main() {
const supabase = createClient(url!, key!, { auth: { autoRefreshToken: false, persistSession: false } })

function mapJob(row: Record<string, unknown>): LegacyDesignJobRow {
  return {
    id: String(row.id),
    drawingNumber: String(row.drawing_number),
    itemType: String(row.item_type ?? "DESIGN"),
    address: String(row.address),
    siteName: (row.site_name as string | null) ?? null,
    siteAddress: (row.site_address as string | null) ?? null,
    typeOfWorks: String(row.type_of_works),
    customTypeDescription: (row.custom_type_description as string | null) ?? null,
    legacyTypeOfWorks: (row.legacy_type_of_works as string | null) ?? null,
    clientCompany: String(row.client_company),
    clientId: (row.client_id as string | null) ?? null,
    requestedBy: String(row.requested_by),
    status: String(row.status),
    designer: String(row.designer ?? ""),
    dateCreated: String(row.date_created),
    dateCompleted: (row.date_completed as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    quoteValue: row.quote_value != null ? Number(row.quote_value) : null,
    quoteReference: (row.quote_reference as string | null) ?? null,
    quoteDate: (row.quote_date as string | null) ?? null,
    commercialNotes: (row.commercial_notes as string | null) ?? null,
    variationFees: row.variation_fees != null ? Number(row.variation_fees) : null,
    additionalCharges: row.additional_charges != null ? Number(row.additional_charges) : null,
    invoiceId: (row.invoice_id as string | null) ?? null,
    billingStatus: (row.billing_status as string | null) ?? null,
    billingBatchId: (row.billing_batch_id as string | null) ?? null,
    requestedDate: (row.requested_date as string | null) ?? null,
    requiredByDate: (row.required_by_date as string | null) ?? null,
    parentJobId: (row.parent_job_id as string | null) ?? null,
    revisionLetter: (row.revision_letter as string | null) ?? null,
    billable: row.billable as boolean | null,
    archivedAt: (row.archived_at as string | null) ?? null,
    archivedBy: (row.archived_by as string | null) ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    geocodedAt: (row.geocoded_at as string | null) ?? null,
    geocodedAddress: (row.geocoded_address as string | null) ?? null,
    locationStatus: (row.location_status as string | null) ?? null,
    locationSource: (row.location_source as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

const { count: existingParents, error: countErr } = await supabase
  .from("parent_jobs")
  .select("*", { count: "exact", head: true })

if (countErr) {
  console.error("parent_jobs table error:", countErr.message)
  process.exit(1)
}

if ((existingParents ?? 0) > 0 && !force) {
  console.log(`parent_jobs already has ${existingParents} row(s) — skipping (use --force to re-run).`)
  process.exit(0)
}

if (force && (existingParents ?? 0) > 0) {
  console.log("Clearing existing Supabase work-items migration…")
  await supabase.from("work_item_id_map").delete().neq("legacy_job_id", "")
  await supabase.from("work_items").delete().neq("id", "")
  await supabase.from("parent_jobs").delete().neq("id", "")
}

const { data: jobRows, error: jobsErr } = await supabase.from("jobs").select("*")
if (jobsErr) {
  console.error("jobs fetch error:", jobsErr.message)
  process.exit(1)
}

const { data: handoffRows, error: handoffErr } = await supabase
  .from("billing_handoffs")
  .select("source_job_id, cleared_by_accounts_at, export_batch_id")
if (handoffErr) {
  console.error("billing_handoffs fetch error:", handoffErr.message)
  process.exit(1)
}

const allJobs = (jobRows ?? []).map(mapJob)
const handoffs: LegacyHandoffRow[] = (handoffRows ?? []).map(h => ({
  sourceJobId: String(h.source_job_id),
  clearedByAccountsAt: (h.cleared_by_accounts_at as string | null) ?? null,
  exportBatchId: (h.export_batch_id as string | null) ?? null,
}))

const migratedAt = new Date().toISOString()
const plan = planDesignJobMigration(allJobs, handoffs, migratedAt)
const validation = validateMigrationPlan(allJobs, plan)

console.log("Migration plan:")
console.log(`  Design parents:  ${validation.stats.designParents}`)
console.log(`  Work items:      ${validation.stats.workItems}`)
console.log(`  ID map entries:  ${validation.stats.idMapEntries}`)

if (!validation.ok) {
  for (const e of validation.errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

if (dryRun) {
  console.log("\nDry run — no writes.")
  process.exit(0)
}

let failed = 0

const parentPayloads = plan.parents.map(p => ({
  id: p.id,
  drawing_number: p.drawingNumber,
  client_id: p.clientId,
  client_company: p.clientCompany,
  site_name: p.siteName,
  site_address: p.siteAddress,
  address: p.address,
  type_of_works: p.typeOfWorks,
  custom_type_description: p.customTypeDescription,
  legacy_type_of_works: p.legacyTypeOfWorks,
  description: p.description,
  requested_by: p.requestedBy,
  item_type: p.itemType,
  archived_at: p.archivedAt,
  archived_by: p.archivedBy,
  latitude: p.latitude,
  longitude: p.longitude,
  geocoded_at: p.geocodedAt,
  geocoded_address: p.geocodedAddress,
  location_status: p.locationStatus,
  location_source: p.locationSource,
  legacy_job_id: p.legacyJobId,
  migrated_at: p.migratedAt,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
}))

for (let i = 0; i < parentPayloads.length; i += 100) {
  const chunk = parentPayloads.slice(i, i + 100)
  const { error } = await supabase.from("parent_jobs").upsert(chunk, { onConflict: "id" })
  if (error) {
    console.error("parent_jobs upsert:", error.message)
    failed++
  }
}

const workPayloads = plan.workItems.map(w => ({
  id: w.id,
  parent_job_id: w.parentJobId,
  work_type: w.workType,
  revision_letter: w.revisionLetter,
  title: w.title,
  description: w.description,
  status: w.status,
  designer: w.designer,
  priority: w.priority,
  billable: w.billable,
  requested_date: w.requestedDate,
  required_by_date: w.requiredByDate,
  notes: w.notes,
  commercial_notes: w.commercialNotes,
  quote_value: w.quoteValue,
  quote_reference: w.quoteReference,
  quote_date: w.quoteDate,
  variation_fees: w.variationFees,
  additional_charges: w.additionalCharges,
  invoice_status: w.invoiceStatus,
  invoice_number: w.invoiceNumber,
  invoice_date: w.invoiceDate,
  billed_value: w.billedValue,
  date_created: w.dateCreated,
  completed_at: w.completedAt,
  legacy_job_id: w.legacyJobId,
  migrated_at: w.migratedAt,
  created_at: w.createdAt,
  updated_at: w.updatedAt,
}))

for (let i = 0; i < workPayloads.length; i += 100) {
  const chunk = workPayloads.slice(i, i + 100)
  const { error } = await supabase.from("work_items").upsert(chunk, { onConflict: "id" })
  if (error) {
    console.error("work_items upsert:", error.message)
    failed++
  }
}

const mapPayloads = plan.idMap.map(m => ({
  legacy_job_id: m.legacyJobId,
  work_item_id: m.workItemId,
  parent_job_id: m.parentJobId,
  migrated_at: migratedAt,
}))

for (let i = 0; i < mapPayloads.length; i += 200) {
  const chunk = mapPayloads.slice(i, i + 200)
  const { error } = await supabase.from("work_item_id_map").upsert(chunk, { onConflict: "legacy_job_id" })
  if (error) {
    console.error("work_item_id_map upsert:", error.message)
    failed++
  }
}

// Remap FK columns
for (const m of plan.idMap) {
  await supabase.from("status_history").update({ work_item_id: m.workItemId }).eq("job_id", m.legacyJobId)
  await supabase.from("billing_handoffs").update({ source_work_item_id: m.workItemId }).eq("source_job_id", m.legacyJobId)
  await supabase.from("calendar_events").update({ work_item_id: m.workItemId }).eq("job_id", m.legacyJobId)
  if (m.legacyJobId === m.parentJobId) {
    await supabase.from("quotes").update({ parent_job_id: m.parentJobId }).eq("job_id", m.legacyJobId)
  }
}

console.log(failed === 0 ? "\nDone." : `\nDone with ${failed} batch error(s).`)
process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
