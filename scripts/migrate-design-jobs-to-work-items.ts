/**
 * Backfill design jobs → parent_jobs + work_items in SQLite.
 *
 * Non-design jobs (site visits, surveys, etc.) are left in Job unchanged.
 * Idempotent: skips when ParentJob rows already exist unless --force.
 *
 * Usage:
 *   npm run migrate:work-items
 *   npm run migrate:work-items -- --force
 *   npm run migrate:work-items -- --dry-run
 */
import { existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"
import {
  planDesignJobMigration,
  validateMigrationPlan,
  type LegacyDesignJobRow,
  type LegacyHandoffRow,
} from "../lib/migrations/work-items-backfill"

const require = createRequire(import.meta.url)

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const dbPath = process.env.DB_PATH ?? join(projectRoot, ".data", "oryx.db")

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const force = args.has("--force")

if (!existsSync(dbPath)) {
  console.error("SQLite database not found at", dbPath, "— run npm run dev once first.")
  process.exit(1)
}

const Database = require("better-sqlite3") as typeof import("better-sqlite3")
const db = new Database(dbPath)

function nowIso(): string {
  return new Date().toISOString()
}

function mapJobRow(r: Record<string, unknown>): LegacyDesignJobRow {
  return {
    id: String(r.id),
    drawingNumber: String(r.drawingNumber),
    itemType: String(r.itemType ?? "DESIGN"),
    address: String(r.address),
    siteName: (r.siteName as string | null) ?? null,
    siteAddress: (r.siteAddress as string | null) ?? null,
    typeOfWorks: String(r.typeOfWorks),
    customTypeDescription: (r.customTypeDescription as string | null) ?? null,
    legacyTypeOfWorks: (r.legacyTypeOfWorks as string | null) ?? null,
    clientCompany: String(r.clientCompany),
    clientId: (r.clientId as string | null) ?? null,
    requestedBy: String(r.requestedBy),
    status: String(r.status),
    designer: String(r.designer ?? ""),
    dateCreated: String(r.dateCreated),
    dateCompleted: (r.dateCompleted as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    quoteValue: (r.quoteValue as number | null) ?? null,
    quoteReference: (r.quoteReference as string | null) ?? null,
    quoteDate: (r.quoteDate as string | null) ?? null,
    commercialNotes: (r.commercialNotes as string | null) ?? null,
    variationFees: (r.variationFees as number | null) ?? null,
    additionalCharges: (r.additionalCharges as number | null) ?? null,
    invoiceId: (r.invoiceId as string | null) ?? null,
    billingStatus: (r.billingStatus as string | null) ?? null,
    billingBatchId: (r.billingBatchId as string | null) ?? null,
    requestedDate: (r.requestedDate as string | null) ?? null,
    requiredByDate: (r.requiredByDate as string | null) ?? null,
    parentJobId: (r.parentJobId as string | null) ?? null,
    revisionLetter: (r.revisionLetter as string | null) ?? null,
    billable: (r.billable as number | null) ?? null,
    archivedAt: (r.archivedAt as string | null) ?? null,
    archivedBy: (r.archivedBy as string | null) ?? null,
    latitude: (r.latitude as number | null) ?? null,
    longitude: (r.longitude as number | null) ?? null,
    geocodedAt: (r.geocodedAt as string | null) ?? null,
    geocodedAddress: (r.geocodedAddress as string | null) ?? null,
    locationStatus: (r.locationStatus as string | null) ?? null,
    locationSource: (r.locationSource as string | null) ?? null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  }
}

const existingParents = (
  db.prepare("SELECT COUNT(*) as n FROM ParentJob").get() as { n: number }
).n

if (existingParents > 0 && !force) {
  console.log(`ParentJob already has ${existingParents} row(s) — skipping (use --force to re-run).`)
  process.exit(0)
}

if (force && existingParents > 0) {
  console.log("Clearing existing work-items migration tables…")
  db.exec(`
    PRAGMA foreign_keys = OFF;
    UPDATE StatusHistory SET workItemId = NULL;
    UPDATE BillingHandoff SET sourceWorkItemId = NULL;
    UPDATE Quote SET parentJobId = NULL;
    UPDATE CalendarEvent SET workItemId = NULL;
    DELETE FROM WorkItemIdMap;
    DELETE FROM WorkItem;
    DELETE FROM ParentJob;
    PRAGMA foreign_keys = ON;
  `)
}

const allJobs = (db.prepare("SELECT * FROM Job ORDER BY dateCreated ASC").all() as Record<string, unknown>[])
  .map(mapJobRow)

const handoffTable = (
  db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='BillingHandoff'").get() as { n: number }
).n > 0

const handoffs: LegacyHandoffRow[] = handoffTable
  ? (db.prepare("SELECT sourceJobId, clearedByAccountsAt, exportBatchId FROM BillingHandoff").all() as LegacyHandoffRow[])
  : []

const migratedAt = nowIso()
const plan = planDesignJobMigration(allJobs, handoffs, migratedAt)
const validation = validateMigrationPlan(allJobs, plan)

console.log("Migration plan:")
console.log(`  Design parents:  ${validation.stats.designParents}`)
console.log(`  Work items:      ${validation.stats.workItems} (${validation.stats.originals} original, ${validation.stats.revisions} revisions)`)
console.log(`  ID map entries:  ${validation.stats.idMapEntries}`)

if (!validation.ok) {
  console.error("\nValidation failed:")
  for (const e of validation.errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

if (dryRun) {
  console.log("\nDry run — no writes.")
  process.exit(0)
}

const insertParent = db.prepare(`
  INSERT INTO ParentJob (
    id, drawingNumber, clientId, clientCompany, siteName, siteAddress, address,
    typeOfWorks, customTypeDescription, legacyTypeOfWorks, description, requestedBy,
    itemType, archivedAt, archivedBy, latitude, longitude, geocodedAt, geocodedAddress,
    locationStatus, locationSource, legacyJobId, migratedAt, createdAt, updatedAt
  ) VALUES (
    @id, @drawingNumber, @clientId, @clientCompany, @siteName, @siteAddress, @address,
    @typeOfWorks, @customTypeDescription, @legacyTypeOfWorks, @description, @requestedBy,
    @itemType, @archivedAt, @archivedBy, @latitude, @longitude, @geocodedAt, @geocodedAddress,
    @locationStatus, @locationSource, @legacyJobId, @migratedAt, @createdAt, @updatedAt
  )
`)

const insertWorkItem = db.prepare(`
  INSERT INTO WorkItem (
    id, parentJobId, workType, revisionLetter, title, description, status, designer,
    priority, billable, requestedDate, requiredByDate, notes, commercialNotes,
    quoteValue, quoteReference, quoteDate, variationFees, additionalCharges,
    invoiceStatus, invoiceNumber, invoiceDate, billedValue, dateCreated, completedAt,
    legacyJobId, migratedAt, createdAt, updatedAt
  ) VALUES (
    @id, @parentJobId, @workType, @revisionLetter, @title, @description, @status, @designer,
    @priority, @billable, @requestedDate, @requiredByDate, @notes, @commercialNotes,
    @quoteValue, @quoteReference, @quoteDate, @variationFees, @additionalCharges,
    @invoiceStatus, @invoiceNumber, @invoiceDate, @billedValue, @dateCreated, @completedAt,
    @legacyJobId, @migratedAt, @createdAt, @updatedAt
  )
`)

const insertMap = db.prepare(`
  INSERT INTO WorkItemIdMap (legacyJobId, workItemId, parentJobId, migratedAt)
  VALUES (@legacyJobId, @workItemId, @parentJobId, @migratedAt)
`)

const updateHistory = db.prepare(
  "UPDATE StatusHistory SET workItemId = ? WHERE jobId = ? AND (workItemId IS NULL OR workItemId = '')",
)
const updateHandoff = db.prepare(
  "UPDATE BillingHandoff SET sourceWorkItemId = ? WHERE sourceJobId = ? AND (sourceWorkItemId IS NULL OR sourceWorkItemId = '')",
)
const updateQuote = db.prepare(
  "UPDATE Quote SET parentJobId = ? WHERE jobId = ? AND (parentJobId IS NULL OR parentJobId = '')",
)
const updateCalendar = db.prepare(
  "UPDATE CalendarEvent SET workItemId = ? WHERE jobId = ? AND (workItemId IS NULL OR workItemId = '')",
)

const run = db.transaction(() => {
  for (const p of plan.parents) {
    insertParent.run(p)
  }
  for (const w of plan.workItems) {
    insertWorkItem.run({
      ...w,
      billable: w.billable ? 1 : 0,
    })
  }
  for (const m of plan.idMap) {
    insertMap.run({ ...m, migratedAt })
  }
  for (const m of plan.idMap) {
    updateHistory.run(m.workItemId, m.legacyJobId)
    updateHandoff.run(m.workItemId, m.legacyJobId)
    updateCalendar.run(m.workItemId, m.legacyJobId)
    if (m.legacyJobId === m.parentJobId) {
      updateQuote.run(m.parentJobId, m.legacyJobId)
    }
  }
})

run()

const parentCount = (db.prepare("SELECT COUNT(*) as n FROM ParentJob").get() as { n: number }).n
const workItemCount = (db.prepare("SELECT COUNT(*) as n FROM WorkItem").get() as { n: number }).n
const mappedHistory = (
  db.prepare("SELECT COUNT(*) as n FROM StatusHistory WHERE workItemId IS NOT NULL").get() as { n: number }
).n
const mappedHandoffs = (
  db.prepare("SELECT COUNT(*) as n FROM BillingHandoff WHERE sourceWorkItemId IS NOT NULL").get() as { n: number }
).n

console.log("\nDone:")
console.log(`  ParentJob rows:     ${parentCount}`)
console.log(`  WorkItem rows:      ${workItemCount}`)
console.log(`  StatusHistory map:  ${mappedHistory}`)
console.log(`  BillingHandoff map: ${mappedHandoffs}`)
console.log("\nNext: npm run supabase:sync-work-items (after 030 migration on Supabase)")
