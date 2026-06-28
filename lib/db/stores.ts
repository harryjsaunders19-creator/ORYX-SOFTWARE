/**
 * lib/db/stores.ts — table access objects (jobDb, clientDb, …).
 */
import { db, DB_PATH, DB_EXISTED } from "./connection"
import { nowIso, buildWhere, safeOrder, type WhereClause, type FindManyOptions } from "./helpers"
import { todayIsoDate, addDaysToIsoDate, totalJobCommercialValue } from "@/lib/utils"
import type {
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  EventCategoryRow,
  UpdateCalendarEventData,
} from "./calendar-types"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nanoid } = require("nanoid") as { nanoid: () => string }

export interface TypeOfWorksMigrationLogRow {
  id: string; jobId: string; drawingNumber: string
  originalValue: string; mappedTo: string; customDescription: string | null
  matchType: string; needsReview: number
  reviewedAt: string | null; reviewedBy: string | null
  migratedAt: string
}

export const typeOfWorksMigrationLogDb = {
  findMany(opts: { needsReview?: boolean } = {}): TypeOfWorksMigrationLogRow[] {
    const w = opts.needsReview !== undefined ? `WHERE needsReview = ${opts.needsReview ? 1 : 0}` : ""
    return db.prepare(`SELECT * FROM TypeOfWorksMigrationLog ${w} ORDER BY needsReview DESC, migratedAt DESC`).all() as TypeOfWorksMigrationLogRow[]
  },
  stats(): { total: number; needsReview: number; exact: number; alias: number; flagged: number } {
    const row = db.prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) as needsReview,
             SUM(CASE WHEN matchType = 'EXACT' THEN 1 ELSE 0 END) as exact,
             SUM(CASE WHEN matchType = 'ALIAS' THEN 1 ELSE 0 END) as alias,
             SUM(CASE WHEN matchType = 'FLAGGED' THEN 1 ELSE 0 END) as flagged
      FROM TypeOfWorksMigrationLog
    `).get() as { total: number; needsReview: number; exact: number; alias: number; flagged: number }
    return row
  },
  /** Marks a flagged entry as reviewed — doesn't change the job itself (do
   *  that via the normal job-edit form if the mapping needs correcting),
   *  just closes the loop on "someone looked at this." */
  markReviewed(id: string, reviewedBy: string): TypeOfWorksMigrationLogRow | null {
    const existing = db.prepare("SELECT * FROM TypeOfWorksMigrationLog WHERE id = ?").get(id) as TypeOfWorksMigrationLogRow | undefined
    if (!existing) return null
    db.prepare("UPDATE TypeOfWorksMigrationLog SET needsReview = 0, reviewedAt = ?, reviewedBy = ? WHERE id = ?")
      .run(nowIso(), reviewedBy, id)
    return db.prepare("SELECT * FROM TypeOfWorksMigrationLog WHERE id = ?").get(id) as TypeOfWorksMigrationLogRow
  },
}

export type { JobRow, CreateJobData, UpdateJobData } from "./job-types"
import type { JobRow, CreateJobData, UpdateJobData } from "./job-types"

export interface InvoiceRow {
  id: string; invoiceNumber: string; invoiceDate: string
  invoiceValue: number; clientCompany: string
  paymentStatus: string   // DRAFT | SENT | PAID
  notes: string | null
  createdBy: string; createdAt: string; updatedAt: string
  sentAt: string | null; paidAt: string | null
}

export interface InvoiceItemRow {
  id: string; invoiceId: string; jobId: string
  drawingNumber: string; description: string | null; value: number
}

export type { BillingHandoffRow, BillingExportBatchRow, BillingExportSnapshotRow } from "./billing-types"
import type { BillingHandoffRow, BillingExportBatchRow } from "./billing-types"

/** The full Accounts Handover payload built for one handoff at export time —
 *  see billingHandoffDb.buildAccountsHandoverSnapshot(). Named explicitly
 *  (rather than inferred via ReturnType<typeof ...>) so it can be referenced
 *  from createExportBatch()'s signature without a self-referential type error. */
/**
 * The full Accounts Handover payload built for one handoff at export time —
 * see billingHandoffDb.buildAccountsHandoverSnapshot(). Named explicitly
 * (rather than inferred via ReturnType<typeof ...>) so it can be referenced
 * from createExportBatch()'s signature without a self-referential type error.
 *
 * Structure mirrors the 8-sheet workbook exactly (lib/billing-export.ts):
 * client / project / request / commercial / design / survey / revisions /
 * audit / attachments. "Job Number" and "Drawing Number" are kept as twin
 * fields under client request even though they're the same underlying
 * value (`Job.drawingNumber`) — there's no second number to report, but
 * both names were asked for explicitly, so both are populated from the one
 * real field rather than omitting either. Same reasoning for Client Name /
 * Company Name (`Client.name` is both, in this domain).
 */
export interface AccountsHandoverSnapshot {
  handoffId: string
  billingEventType: string
  client: {
    clientName: string; companyName: string
    contactName: string | null; contactEmail: string | null; contactTelephone: string | null
    billingContact: string | null; billingAddress: string | null
    clientNotes: string | null
  }
  project: {
    jobNumber: string; drawingNumber: string
    projectName: string | null; projectDescription: string | null
    siteAddress: string; typeOfWorks: string | null
    otherTypeDescription: string | null; allNotes: string | null
    jobStatus: string; priority: string | null
    creationDate: string; dueDate: string | null; completionDate: string
  }
  request: {
    requestedBy: string | null; companyRequestingWorks: string
    requestDate: string | null; requestSource: string | null
    internalReferences: string | null
    purchaseOrderNumber: string | null; costCentre: string | null
  }
  commercial: {
    agreedFee: number | null; quotedFee: number | null; quoteReference: string | null
    variationFees: number | null; additionalCharges: number | null
    revisionCharges: number | null; commercialNotes: string | null
    paymentTerms: string | null
  }
  design: {
    assignedDesigner: string | null; completedBy: string | null
    designCompletionDate: string; designNotes: string | null; designReference: string
  }
  survey: {
    assignedSurveyor: string | null; surveyDate: string | null
    surveyNotes: string | null; surveyReferences: string | null
  }
  revisions: {
    revisionCount: number
    history: {
      drawingNumber: string; revisionLetter: string | null; status: string
      requestedDate: string | null; completionDate: string | null
      description: string | null; charge: number | null
    }[]
  }
  audit: {
    createdBy: string | null; createdDate: string
    lastModifiedBy: string | null; lastModifiedDate: string
    addedToQueueAt: string
    fullHistory: { fromStatus: string | null; toStatus: string; changedBy: string; changedAt: string; note: string | null }[]
  }
  attachments: { note: string; items: { fileName: string; reference: string; uploadedAt: string }[] }
  notTracked: string[]
}

export type { StatusHistoryRow } from "./history-types"
import type { StatusHistoryRow } from "./history-types"

export type { Role, UserRow, CreateUserData, UpdateUserData, PublicUserRow } from "./user-types"
export { withoutPassword } from "./user-types"

import type { CreateUserData, UpdateUserData, UserRow } from "./user-types"

// CreateJobData / UpdateJobData — see ./job-types

// ── Job queries ───────────────────────────────────────────────────

export const jobDb = {
  /**
   * Records a billing handoff for a job that has just reached ISSUED — but only
   * if one doesn't already exist for it. The UNIQUE(sourceJobId) constraint on
   * BillingHandoff is the actual guarantee; INSERT OR IGNORE just means a repeat
   * call (e.g. a job bouncing CHECKING → ISSUED → CHECKING → ISSUED again) is a
   * silent no-op instead of a thrown constraint error. Must be called from
   * inside the same transaction as the status write, so the two can never
   * disagree about whether a job is "ISSUED with a handoff" or "ISSUED without one".
   */
  _recordBillingHandoffIfIssued(job: JobRow) {
    if (job.status !== "ISSUED") return
    const billingEventType = job.parentJobId ? "REVISION_COMPLETED" : "JOB_COMPLETED"
    const completionDate   = job.dateCompleted ?? nowIso().slice(0, 10)
    db.prepare(`
      INSERT OR IGNORE INTO BillingHandoff
        (id, sourceJobId, billingEventType, drawingNumber, itemType, typeOfWorks, customTypeDescription,
         clientCompany, address, designer, quoteValue, quoteReference, completionDate,
         addedToBillingQueueAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(), job.id, billingEventType, job.drawingNumber, job.itemType, job.typeOfWorks, job.customTypeDescription,
      job.clientCompany, job.address, job.designer || null,
      totalJobCommercialValue(job) ?? job.quoteValue, job.quoteReference,
      completionDate, nowIso(), nowIso(), nowIso(),
    )
  },

  findMany(opts: FindManyOptions = {}): JobRow[] {
    const { sql: w, params } = buildWhere(opts.where)
    const order  = opts.orderBy ? safeOrder(opts.orderBy.field, opts.orderBy.dir) : safeOrder("drawingNumber", "asc")
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Job ${w} ${order} ${limit} ${offset}`).all(...params) as JobRow[]
  },

  count(where: WhereClause = {}): number {
    const { sql: w, params } = buildWhere(where)
    return (db.prepare(`SELECT COUNT(*) as n FROM Job ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): JobRow | null {
    return (db.prepare("SELECT * FROM Job WHERE id = ?").get(id) as JobRow) ?? null
  },

  /** Batched version of findUnique for a list of ids — one query instead of N. Results
   *  are not guaranteed to preserve the input order; callers needing a specific order
   *  (e.g. the billing export, which preserves selection order) should re-sort by id. */
  findManyByIds(ids: string[]): JobRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return db.prepare(`SELECT * FROM Job WHERE id IN (${placeholders})`).all(...ids) as JobRow[]
  },

  revisionsForJob(parentId: string): JobRow[] {
    return db.prepare("SELECT * FROM Job WHERE parentJobId = ? ORDER BY revisionLetter ASC").all(parentId) as JobRow[]
  },

  /** Latest revision row per original job (by max revisionLetter). */
  findLatestRevisionsForParents(parentIds: string[]): JobRow[] {
    if (!parentIds.length) return []
    const placeholders = parentIds.map(() => "?").join(",")
    return db.prepare(`
      SELECT j.* FROM Job j
      INNER JOIN (
        SELECT parentJobId, MAX(revisionLetter) AS maxLetter
        FROM Job
        WHERE parentJobId IN (${placeholders})
        GROUP BY parentJobId
      ) latest ON j.parentJobId = latest.parentJobId AND j.revisionLetter = latest.maxLetter
    `).all(...parentIds) as JobRow[]
  },

  create(data: CreateJobData): JobRow {
    const now = nowIso(); const changedBy = data.changedBy ?? "System"
    db.transaction(() => {
      db.prepare(`
        INSERT INTO Job (id,drawingNumber,itemType,address,typeOfWorks,customTypeDescription,clientCompany,clientId,requestedBy,
          status,designer,dateCompleted,notes,quoteValue,quoteReference,quoteDate,commercialNotes,
          variationFees,additionalCharges,
          parentJobId,revisionLetter,requestedDate,requiredByDate,dateCreated,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(data.id, data.drawingNumber, data.itemType ?? "DESIGN", data.address, data.typeOfWorks,
             data.customTypeDescription ?? null,
             data.clientCompany, data.clientId ?? null, data.requestedBy, data.status, data.designer ?? "",
             data.dateCompleted ?? null, data.notes ?? null,
             data.quoteValue ?? null, data.quoteReference ?? null,
             data.quoteDate ?? null, data.commercialNotes ?? null,
             data.variationFees ?? null, data.additionalCharges ?? null,
             data.parentJobId ?? null, data.revisionLetter ?? null,
             data.requestedDate ?? null, data.requiredByDate ?? null,
             now, now, now)
      db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt) VALUES (?,?,NULL,?,?,?)")
        .run(nanoid(), data.id, data.status, changedBy, now)
      this._recordBillingHandoffIfIssued(this.findUnique(data.id)!)
    })()
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateJobData): JobRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const changedBy = data.changedBy ?? "System"
    const statusChanged = data.status !== undefined && data.status !== existing.status
    const oldStatus = existing.status
    const fields: string[] = []; const params: unknown[] = []
    const colData = { ...data } as Record<string, unknown>; delete colData.changedBy
    for (const [key, val] of Object.entries(colData)) {
      if (val !== undefined) { fields.push(`"${key}" = ?`); params.push(val) }
    }
    if (fields.length === 0 && !statusChanged) return existing
    db.transaction(() => {
      if (fields.length > 0) {
        fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
        db.prepare(`UPDATE Job SET ${fields.join(", ")} WHERE id = ?`).run(...params)
      }
      if (statusChanged) {
        // Reverting away from Complete must undo the automatic billing
        // handoff that reaching Complete created — otherwise a job
        // bounced back to an earlier status (by mistake or otherwise)
        // stays permanently visible in the billing queue and flagged as
        // sent to accounts, which is exactly the bug this exists to fix.
        // Going the other way (-> ISSUED) is unaffected; that path already
        // worked correctly.
        let historyNote: string | null = null
        if (oldStatus === "ISSUED" && data.status !== "ISSUED") {
          historyNote = this._retractBillingHandoffOnRevert(id)
        }
        db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
          .run(nanoid(), id, oldStatus, data.status, changedBy, nowIso(), historyNote)
        if (data.status === "ISSUED") {
          this._recordBillingHandoffIfIssued(this.findUnique(id)!)
        }
      }
    })()
    return this.findUnique(id)
  },

  /**
   * Called when a job's status changes away from ISSUED. Looks up the
   * job's current *active* (uncleared) billing handoff:
   *   - If one exists, it's deleted outright — nothing irreversible has
   *     happened to an uncleared handoff (no export batch references it,
   *     accounts hasn't actioned it), so removing it is safe and is
   *     exactly what "must not appear in the Billing tab" requires.
   *   - If the job's most recent handoff is already *cleared*, it is
   *     never touched — it's a permanent audit record, already linked
   *     into a real BillingExportBatch snapshot, and this codebase's
   *     standing rule is that audit trails (StatusHistory, ExportBatch,
   *     ClientHold, and now this) are never deleted. Returns a note
   *     string in that case so the discrepancy is visible in the job's
   *     own status history rather than silently invisible.
   * Returns the note to attach to the status-change history row being
   * written by the caller (null in the common case — nothing to flag).
   */
  _retractBillingHandoffOnRevert(jobId: string): string | null {
    const active = billingHandoffDb.findBySourceJobId(jobId)
    if (active) {
      db.prepare("DELETE FROM BillingHandoff WHERE id = ?").run(active.id)
      return null
    }
    const [mostRecent] = billingHandoffDb.findHistoryBySourceJobId(jobId)
    if (mostRecent && mostRecent.clearedByAccountsAt) {
      return `Note: this job had already been cleared for accounts (${mostRecent.exportBatchId ? `batch ${mostRecent.exportBatchId}` : "no batch reference"}) before being reverted from Complete. That historical billing record was not deleted.`
    }
    return null
  },

  assignDesigner(id: string, designer: string, changedBy: string): { job: JobRow } | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    db.transaction(() => {
      db.prepare('UPDATE Job SET designer = ?, "updatedAt" = ? WHERE id = ?').run(designer.trim(), now, id)
      db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
        .run(nanoid(), id, existing.status, existing.status, changedBy, now, `Designer assigned: ${designer.trim()}`)
    })()
    return { job: this.findUnique(id)! }
  },

  /**
   * Checks whether a job is safe to hard-delete. Returns a list of human-readable
   * reasons it can't be (empty array = safe to delete). Without this, deleting a
   * job could: silently orphan its revisions (parentJobId is ON DELETE SET NULL,
   * so the revision survives but loses its link to the parent and starts being
   * counted as an "original" job); leave a deprecated Invoice's stored
   * invoiceValue stale; throw a raw, uncaught SQLite FK error if it's already in
   * a deprecated ExportBatch; or destroy a BillingHandoff record accounts may
   * already be relying on (or have already cleared) for that completion event.
   */
  deletionBlockers(id: string): string[] {
    const reasons: string[] = []
    const revisionCount = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE parentJobId = ?").get(id) as { n: number }).n
    if (revisionCount > 0) {
      reasons.push(`This job has ${revisionCount} revision${revisionCount === 1 ? "" : "s"} — delete ${revisionCount === 1 ? "it" : "them"} first.`)
    }
    const job = this.findUnique(id)
    if (job?.invoiceId) {
      reasons.push("This job has already been invoiced.")
    }
    if (job?.billingStatus === "EXPORTED_TO_ACCOUNTS") {
      reasons.push("This job has already been exported to accounts.")
    }
    const handoff = (db.prepare("SELECT id, clearedByAccountsAt FROM BillingHandoff WHERE sourceJobId = ?").get(id) as { id: string; clearedByAccountsAt: string | null } | undefined)
    if (handoff) {
      reasons.push(handoff.clearedByAccountsAt
        ? "This job has already been cleared for invoicing by accounts."
        : "This job is in the Ready For Invoicing queue.")
    }
    return reasons
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM Job WHERE id = ?").run(id).changes > 0
  },

  /**
   * Insert a job row verbatim from Supabase into SQLite without side-effects
   * (no StatusHistory entry, no BillingHandoff). Used to sync jobs down from
   * Supabase so FK constraints and subsequent SQLite writes work on Vercel,
   * where the ephemeral /tmp SQLite starts empty on cold boot.
   */
  rawInsertOrIgnore(job: import("@/lib/db/job-types").JobRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO Job
        (id,drawingNumber,itemType,address,typeOfWorks,customTypeDescription,clientCompany,clientId,requestedBy,
         status,designer,dateCompleted,notes,quoteValue,quoteReference,quoteDate,commercialNotes,
         variationFees,additionalCharges,parentJobId,revisionLetter,requestedDate,requiredByDate,
         dateCreated,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      job.id, job.drawingNumber, job.itemType, job.address, job.typeOfWorks,
      job.customTypeDescription ?? null, job.clientCompany, job.clientId ?? null, job.requestedBy,
      job.status, job.designer ?? "", job.dateCompleted ?? null, job.notes ?? null,
      job.quoteValue ?? null, job.quoteReference ?? null, job.quoteDate ?? null,
      job.commercialNotes ?? null, job.variationFees ?? null, job.additionalCharges ?? null,
      job.parentJobId ?? null, job.revisionLetter ?? null,
      job.requestedDate ?? null, job.requiredByDate ?? null,
      job.dateCreated, job.createdAt, job.updatedAt,
    )
  },

  groupByItemType(): { itemType: string; count: number }[] {
    return db.prepare("SELECT itemType, COUNT(*) as count FROM Job GROUP BY itemType").all() as { itemType: string; count: number }[]
  },

  deadlineStats(): { overdueCount: number; dueTodayCount: number; dueThisWeekCount: number } {
    const overdueCount    = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'").get() as { n: number }).n
    const dueTodayCount   = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate = date('now')").get() as { n: number }).n
    const dueThisWeekCount= (db.prepare("SELECT COUNT(*) as n FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days')").get() as { n: number }).n
    return { overdueCount, dueTodayCount, dueThisWeekCount }
  },

  /** Overdue jobs for dashboard alert — all non-issued jobs past their deadline */
  overdueJobs(): JobRow[] {
    return db.prepare(
      "SELECT * FROM Job WHERE requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED' ORDER BY requiredByDate ASC LIMIT 20"
    ).all() as JobRow[]
  },

  groupByStatus(): { status: string; count: number }[] {
    return db.prepare("SELECT status, COUNT(*) as count FROM Job GROUP BY status").all() as { status: string; count: number }[]
  },

  /** Distinct designer names already used on jobs — feeds the inline assign picker so reassigning to
   *  someone who's worked a job before is a single click instead of re-typing their name. */
  distinctDesigners(): string[] {
    const rows = db.prepare(
      "SELECT DISTINCT designer FROM Job WHERE designer IS NOT NULL AND designer != '' ORDER BY designer COLLATE NOCASE ASC"
    ).all() as { designer: string }[]
    return rows.map(r => r.designer)
  },

  countWhere(where: WhereClause & { createdAfter?: string }): number {
    const clauses: string[] = []; const params: unknown[] = []
    if (where.status)        { clauses.push("status = ?");                        params.push(where.status) }
    if (where.createdAfter)  { clauses.push("createdAt >= ?");                    params.push(where.createdAfter) }
    if (where.unassigned)    { clauses.push("(designer = '' OR designer IS NULL)") }
    if (where.onlyOriginals) { clauses.push("parentJobId IS NULL") }
    if (where.onlyRevisions) { clauses.push("parentJobId IS NOT NULL") }
    if (where.notInvoiced)   { clauses.push("invoiceId IS NULL") }
    if (where.invoiced)      { clauses.push("invoiceId IS NOT NULL") }
    if (where.overdue)       { clauses.push("requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'") }
    if (where.dueToday)      { clauses.push("requiredByDate IS NOT NULL AND requiredByDate = date('now')") }
    if (where.dueThisWeek)   { clauses.push("requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days')") }
    const sql = clauses.length ? `SELECT COUNT(*) as n FROM Job WHERE ${clauses.join(" AND ")}` : "SELECT COUNT(*) as n FROM Job"
    return (db.prepare(sql).get(...params) as { n: number }).n
  },

  findRecent(take: number) {
    return db.prepare(
      `SELECT id,drawingNumber,itemType,address,status,clientCompany,designer,quoteValue,invoiceId,parentJobId,revisionLetter,dateCreated,createdAt
       FROM Job ORDER BY dateCreated DESC LIMIT ?`
    ).all(take) as Pick<JobRow, "id"|"drawingNumber"|"itemType"|"address"|"status"|"clientCompany"|"designer"|"quoteValue"|"invoiceId"|"parentJobId"|"revisionLetter"|"createdAt">[]
  },

  /** All ISSUED jobs not yet invoiced — the invoice queue */
  invoiceQueue(): JobRow[] {
    return db.prepare(
      "SELECT * FROM Job WHERE status = 'ISSUED' AND (invoiceId IS NULL) ORDER BY clientCompany ASC, createdAt ASC"
    ).all() as JobRow[]
  },

  /** Billing queue: ISSUED, not invoiced, not already exported */
  billingQueue(): JobRow[] {
    return db.prepare(
      `SELECT * FROM Job
       WHERE status = 'ISSUED'
         AND (invoiceId IS NULL)
         AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')
       ORDER BY clientCompany ASC, createdAt ASC`
    ).all() as JobRow[]
  },
}

// ── Invoice queries ───────────────────────────────────────────────

export interface CreateInvoiceData {
  invoiceDate:   string
  clientCompany: string
  paymentStatus?: string
  notes?:        string | null
  createdBy?:    string
  /** job ids + optional per-line values */
  items: { jobId: string; value?: number | null; description?: string | null }[]
}

export const invoiceDb = {
  findMany(opts: { status?: string; clientCompany?: string; skip?: number; take?: number } = {}): InvoiceRow[] {
    const clauses: string[] = []; const params: unknown[] = []
    if (opts.status)        { clauses.push("paymentStatus = ?"); params.push(opts.status) }
    if (opts.clientCompany) { clauses.push("clientCompany = ?"); params.push(opts.clientCompany) }
    const w     = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Invoice ${w} ORDER BY invoiceDate DESC, createdAt DESC ${limit} ${offset}`).all(...params) as InvoiceRow[]
  },

  count(opts: { status?: string } = {}): number {
    const clauses: string[] = []; const params: unknown[] = []
    if (opts.status) { clauses.push("paymentStatus = ?"); params.push(opts.status) }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Invoice ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): InvoiceRow | null {
    return (db.prepare("SELECT * FROM Invoice WHERE id = ?").get(id) as InvoiceRow) ?? null
  },

  findByNumber(num: string): InvoiceRow | null {
    return (db.prepare("SELECT * FROM Invoice WHERE invoiceNumber = ?").get(num) as InvoiceRow) ?? null
  },

  /** Items (line rows) for a given invoice, joined with job data */
  itemsForInvoice(invoiceId: string): (InvoiceItemRow & Pick<JobRow, "address"|"typeOfWorks"|"clientCompany"|"status">)[] {
    return db.prepare(`
      SELECT ii.*, j.address, j.typeOfWorks, j.clientCompany, j.status
      FROM InvoiceItem ii
      JOIN Job j ON j.id = ii.jobId
      WHERE ii.invoiceId = ?
      ORDER BY ii.drawingNumber ASC
    `).all(invoiceId) as (InvoiceItemRow & Pick<JobRow, "address"|"typeOfWorks"|"clientCompany"|"status">)[]
  },

  /** Generate next invoice number: INV-YYYY-NNN */
  nextNumber(): string {
    const year = new Date().getFullYear()
    const run = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM InvoiceSequence WHERE year = ?").get(year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE InvoiceSequence SET seq = ? WHERE year = ?").run(next, year)
        return next
      } else {
        db.prepare("INSERT INTO InvoiceSequence (id,year,seq) VALUES (?,?,1)").run(nanoid(), year)
        return 1
      }
    })
    const seq = run()
    return `INV-${year}-${String(seq).padStart(3, "0")}`
  },

  /**
   * Create an invoice for one or more jobs.
   * Validates that every job is ISSUED and not already invoiced.
   * Returns { invoice, error } — error is a human-readable string on failure.
   */
  create(data: CreateInvoiceData): { invoice: InvoiceRow } | { error: string } {
    if (!data.items.length) return { error: "At least one job is required" }

    // Validate all jobs and keep the fetched rows so we don't re-fetch them below
    const jobsById = new Map<string, JobRow>()
    for (const item of data.items) {
      const job = jobDb.findUnique(item.jobId)
      if (!job) return { error: `Job ${item.jobId} not found` }
      if (job.status !== "ISSUED") return { error: `${job.drawingNumber} is not Issued — only Issued jobs can be invoiced` }
      if (job.invoiceId) return { error: `${job.drawingNumber} has already been invoiced` }
      jobsById.set(item.jobId, job)
    }

    const id            = nanoid()
    const invoiceNumber = this.nextNumber()
    const now           = nowIso()
    const createdBy     = data.createdBy ?? "System"

    // Calculate total value: use item.value if given, else job.quoteValue, else 0
    let total = 0
    const resolvedItems: { jobId: string; dn: string; desc: string | null; value: number }[] = []
    for (const item of data.items) {
      const job = jobsById.get(item.jobId)!
      const v   = item.value != null ? item.value : (job.quoteValue ?? 0)
      total += v
      resolvedItems.push({ jobId: item.jobId, dn: job.drawingNumber, desc: item.description ?? null, value: v })
    }

    db.transaction(() => {
      // Insert invoice header
      db.prepare(`
        INSERT INTO Invoice (id,invoiceNumber,invoiceDate,invoiceValue,clientCompany,paymentStatus,notes,createdBy,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(id, invoiceNumber, data.invoiceDate, total, data.clientCompany,
             data.paymentStatus ?? "DRAFT", data.notes ?? null, createdBy, now, now)

      // Insert line items + mark jobs as invoiced
      for (const ri of resolvedItems) {
        db.prepare("INSERT INTO InvoiceItem (id,invoiceId,jobId,drawingNumber,description,value) VALUES (?,?,?,?,?,?)")
          .run(nanoid(), id, ri.jobId, ri.dn, ri.desc, ri.value)
        db.prepare('UPDATE Job SET invoiceId = ?, "updatedAt" = ? WHERE id = ?')
          .run(id, now, ri.jobId)
        // Audit entry on the job
        db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
          .run(nanoid(), ri.jobId, "ISSUED", "ISSUED", createdBy, now, `Invoiced: ${invoiceNumber}`)
      }
    })()

    return { invoice: this.findUnique(id)! }
  },

  /** Update payment status + record audit timestamp */
  updateStatus(id: string, paymentStatus: string, changedBy: string): InvoiceRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null

    const now = nowIso()
    const sentAt = paymentStatus === "SENT" ? (existing.sentAt ?? now) : existing.sentAt
    const paidAt = paymentStatus === "PAID" ? (existing.paidAt ?? now) : existing.paidAt

    db.transaction(() => {
      db.prepare('UPDATE Invoice SET paymentStatus = ?, sentAt = ?, paidAt = ?, "updatedAt" = ? WHERE id = ?')
        .run(paymentStatus, sentAt, paidAt, now, id)

      // Audit each job on the invoice
      const items = this.itemsForInvoice(id)
      const note  = paymentStatus === "SENT" ? `Invoice ${existing.invoiceNumber} sent`
                  : paymentStatus === "PAID" ? `Invoice ${existing.invoiceNumber} paid`
                  : `Invoice ${existing.invoiceNumber} status → ${paymentStatus}`
      for (const item of items) {
        db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
          .run(nanoid(), item.jobId, "ISSUED", "ISSUED", changedBy, now, note)
      }
    })()

    return this.findUnique(id)
  },

  /** Delete an invoice and un-link its jobs (so they can be re-invoiced) */
  delete(id: string): boolean {
    const invoice = this.findUnique(id)
    if (!invoice) return false
    const items = this.itemsForInvoice(id)
    db.transaction(() => {
      // Un-link jobs
      for (const item of items) {
        db.prepare('UPDATE Job SET invoiceId = NULL, "updatedAt" = ? WHERE id = ?').run(nowIso(), item.jobId)
      }
      db.prepare("DELETE FROM Invoice WHERE id = ?").run(id)
    })()
    return true
  },

  /** Invoice aggregates for stats and reporting */
  stats() {
    const total = (db.prepare("SELECT COUNT(*) as n FROM Invoice").get() as { n: number }).n
    const draft = (db.prepare("SELECT COUNT(*) as n FROM Invoice WHERE paymentStatus='DRAFT'").get() as { n: number }).n
    const sent  = (db.prepare("SELECT COUNT(*) as n FROM Invoice WHERE paymentStatus='SENT'").get() as { n: number }).n
    const paid  = (db.prepare("SELECT COUNT(*) as n FROM Invoice WHERE paymentStatus='PAID'").get() as { n: number }).n
    const outstandingValue = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus IN ('DRAFT','SENT')").get() as { v: number }).v
    const totalPaid        = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus='PAID'").get() as { v: number }).v
    const readyToInvoice   = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE status='ISSUED' AND invoiceId IS NULL").get() as { n: number }).n
    return { total, draft, sent, paid, outstandingValue, totalPaid, readyToInvoice }
  },

  monthlyStats(month: string) {
    const totalInvoiced = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE strftime('%Y-%m',invoiceDate)=?").get(month) as { v: number }).v
    const totalPaid     = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus='PAID' AND strftime('%Y-%m',paidAt)=?").get(month) as { v: number }).v
    const outstanding   = (db.prepare("SELECT COALESCE(SUM(invoiceValue),0) as v FROM Invoice WHERE paymentStatus IN ('DRAFT','SENT')").get() as { v: number }).v
    return { totalInvoiced, totalPaid, outstanding }
  },

  revenueByClient(): { clientCompany: string; total: number; count: number }[] {
    return db.prepare(`
      SELECT clientCompany, COALESCE(SUM(invoiceValue),0) as total, COUNT(*) as count
      FROM Invoice GROUP BY clientCompany ORDER BY total DESC
    `).all() as { clientCompany: string; total: number; count: number }[]
  },
}

// ── Status history ────────────────────────────────────────────────

export const historyDb = {
  forJob(jobId: string): StatusHistoryRow[] {
    return db.prepare("SELECT * FROM StatusHistory WHERE jobId = ? ORDER BY changedAt ASC").all(jobId) as StatusHistoryRow[]
  },
  addNote(jobId: string, note: string, changedBy: string): StatusHistoryRow {
    const job = jobDb.findUnique(jobId); const id = nanoid(); const now = nowIso()
    db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)")
      .run(id, jobId, job?.status ?? null, job?.status ?? "", changedBy, now, note)
    return db.prepare("SELECT * FROM StatusHistory WHERE id = ?").get(id) as StatusHistoryRow
  },
}

// ── Drawing sequences ─────────────────────────────────────────────

export const sequenceDb = {
  nextSequence(yearMonth: string): number {
    const run = db.transaction(() => {
      const existing = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
      if (existing) {
        const next = existing.sequence + 1
        db.prepare("UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?").run(next, yearMonth)
        return next
      } else {
        db.prepare("INSERT INTO DrawingSequence (id,yearMonth,sequence) VALUES (?,?,1)").run(nanoid(), yearMonth)
        return 1
      }
    })
    return run() as number
  },

  /**
   * Generate a reference number for non-drawing work items.
   * Format: PREFIX-YYYY-NNN  e.g. SV-2026-001
   * Prefixes: SV (Site Visit), SRV (Survey), INS (Inspection)
   */
  nextRefNumber(prefix: string): string {
    const year = new Date().getFullYear()
    const run = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?").get(prefix, year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?").run(next, prefix, year)
        return next
      } else {
        db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,1)").run(nanoid(), prefix, year)
        return 1
      }
    })
    const seq = run()
    return `${prefix}-${year}-${String(seq).padStart(3, "0")}`
  },

  currentSequence(yearMonth: string): number {
    const row = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
    return row?.sequence ?? 0
  },

  /** Seed (or bump up) the drawing sequence for a year-month from an external source (e.g. Supabase). */
  seedSequence(yearMonth: string, value: number): void {
    const existing = db.prepare("SELECT sequence FROM DrawingSequence WHERE yearMonth = ?").get(yearMonth) as { sequence: number } | undefined
    if (!existing) {
      db.prepare("INSERT INTO DrawingSequence (id,yearMonth,sequence) VALUES (?,?,?)").run(nanoid(), yearMonth, value)
    } else if (existing.sequence < value) {
      db.prepare("UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?").run(value, yearMonth)
    }
  },

  /** Seed (or bump up) the ref sequence for a prefix/year from an external source (e.g. Supabase). */
  seedRefSequence(prefix: string, year: number, value: number): void {
    const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?").get(prefix, year) as { seq: number } | undefined
    if (!existing) {
      db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,?)").run(nanoid(), prefix, year, value)
    } else if (existing.seq < value) {
      db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?").run(value, prefix, year)
    }
  },

  /**
   * Scans every Job.drawingNumber in the database, extracts the YYMM key
   * and sequence number from each, and ensures the DrawingSequence counter
   * for that YYMM is at least as high as the highest number found. This
   * prevents duplicate drawing numbers after:
   *   - a database restore from backup
   *   - manual SQL inserts or data migration from an older system
   *   - a bulk spreadsheet import (called as a safety net after every import)
   *
   * Also reconciles RefSequence counters (SV/SRV/INS prefixes) the same way.
   *
   * Atomic: runs inside a single SQLite transaction. Idempotent: safe to
   * call repeatedly — it only ever raises counters, never lowers them.
   */
  syncFromExistingJobs(): { drawingFixups: number; refFixups: number } {
    let drawingFixups = 0
    let refFixups = 0

    db.transaction(() => {
      // ── Drawing numbers (YY/ORYX/MM/NNN) ──────────────────────
      const drawingRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%/ORYX/%'"
      ).all() as { drawingNumber: string }[]

      const maxByYearMonth = new Map<string, number>()
      for (const row of drawingRows) {
        const match = row.drawingNumber.match(/^(\d{2})\/ORYX\/(\d{2})\/(\d+)/)
        if (!match) continue
        const [, yy, mm, nnn] = match
        const key = `${yy}${mm}`
        const seq = parseInt(nnn, 10)
        const prev = maxByYearMonth.get(key) ?? 0
        if (seq > prev) maxByYearMonth.set(key, seq)
      }

      for (const [yearMonth, maxSeq] of maxByYearMonth) {
        const existing = db.prepare(
          "SELECT sequence FROM DrawingSequence WHERE yearMonth = ?"
        ).get(yearMonth) as { sequence: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO DrawingSequence (id, yearMonth, sequence) VALUES (?, ?, ?)"
          ).run(nanoid(), yearMonth, maxSeq)
          drawingFixups++
        } else if (existing.sequence < maxSeq) {
          db.prepare(
            "UPDATE DrawingSequence SET sequence = ? WHERE yearMonth = ?"
          ).run(maxSeq, yearMonth)
          drawingFixups++
        }
      }

      // ── Reference numbers (PREFIX-YYYY-NNN) ───────────────────
      const refRows = db.prepare(
        "SELECT drawingNumber FROM Job WHERE drawingNumber LIKE '%-%-%'"
      ).all() as { drawingNumber: string }[]

      const maxByPrefixYear = new Map<string, number>()
      for (const row of refRows) {
        const match = row.drawingNumber.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
        if (!match) continue
        const [, prefix, yearStr, nnn] = match
        const mapKey = `${prefix}||${yearStr}`
        const seq = parseInt(nnn, 10)
        const prev = maxByPrefixYear.get(mapKey) ?? 0
        if (seq > prev) maxByPrefixYear.set(mapKey, seq)
      }

      for (const [mapKey, maxSeq] of maxByPrefixYear) {
        const [prefix, yearStr] = mapKey.split("||")
        const year = parseInt(yearStr, 10)
        const existing = db.prepare(
          "SELECT seq FROM RefSequence WHERE prefix = ? AND year = ?"
        ).get(prefix, year) as { seq: number } | undefined

        if (!existing) {
          db.prepare(
            "INSERT INTO RefSequence (id, prefix, year, seq) VALUES (?, ?, ?, ?)"
          ).run(nanoid(), prefix, year, maxSeq)
          refFixups++
        } else if (existing.seq < maxSeq) {
          db.prepare(
            "UPDATE RefSequence SET seq = ? WHERE prefix = ? AND year = ?"
          ).run(maxSeq, prefix, year)
          refFixups++
        }
      }
    })()

    return { drawingFixups, refFixups }
  },
}

// Ensure drawing-number and reference-number sequence counters are at least
// as high as the highest values actually present in the Job table. Protects
// against duplicate numbers after a database restore, manual SQL inserts, or
// data migration from another system. Harmless no-op when already in sync.
// Skipped when the DB is brand-new (tables not yet created) or during the
// Next.js production build phase where no database is available.
if (DB_EXISTED) {
  try {
    const { drawingFixups, refFixups } = sequenceDb.syncFromExistingJobs()
    if (drawingFixups || refFixups) {
      console.log(`[syncDrawingSequences] Reconciled ${drawingFixups} drawing sequence(s) and ${refFixups} reference sequence(s) to match existing Job data.`)
    }
  } catch {
    // Silently skip if tables aren't ready yet (e.g. mid-migration or build time)
  }
}

// ── Billing handoff (Ready For Invoicing queue) ─────────────────────
// Replaces the Invoice/ExportBatch workflow. See the schema comment above
// BillingHandoff and PROJECT_OVERVIEW.md §19 for the full rationale.

export const billingHandoffDb = {
  findMany(opts: { cleared?: boolean; skip?: number; take?: number } = {}): BillingHandoffRow[] {
    const clauses: string[] = []
    if (opts.cleared === true)  clauses.push("clearedByAccountsAt IS NOT NULL")
    if (opts.cleared === false) clauses.push("clearedByAccountsAt IS NULL")
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    // Awaiting items are FIFO (oldest-added first, so accounts works through
    // a backlog in order); cleared items are most-recently-cleared first.
    const order  = opts.cleared === true ? "ORDER BY clearedByAccountsAt DESC" : "ORDER BY addedToBillingQueueAt ASC"
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM BillingHandoff ${w} ${order} ${limit} ${offset}`).all() as BillingHandoffRow[]
  },

  /** Batched fetch for building an export — preserves no particular order;
   *  callers needing input order should re-sort by id. */
  findManyByIds(ids: string[]): BillingHandoffRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return db.prepare(`SELECT * FROM BillingHandoff WHERE id IN (${placeholders})`).all(...ids) as BillingHandoffRow[]
  },

  count(opts: { cleared?: boolean } = {}): number {
    const clauses: string[] = []
    if (opts.cleared === true)  clauses.push("clearedByAccountsAt IS NOT NULL")
    if (opts.cleared === false) clauses.push("clearedByAccountsAt IS NULL")
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM BillingHandoff ${w}`).get() as { n: number }).n
  },

  findUnique(id: string): BillingHandoffRow | null {
    return (db.prepare("SELECT * FROM BillingHandoff WHERE id = ?").get(id) as BillingHandoffRow) ?? null
  },

  /** The job's *current, active* handoff (uncleared) — used by the job
   *  detail page to show whether this job is presently in the billing
   *  queue. A job can accumulate multiple historical (cleared) handoffs
   *  over its lifetime if it's completed, billed, reverted, and completed
   *  again, so this deliberately does not just grab "a" row — it filters
   *  to the one the partial unique index actually enforces uniqueness on.
   *  Use findHistoryBySourceJobId for the full lifetime list. */
  findBySourceJobId(jobId: string): BillingHandoffRow | null {
    return (db.prepare("SELECT * FROM BillingHandoff WHERE sourceJobId = ? AND clearedByAccountsAt IS NULL").get(jobId) as BillingHandoffRow) ?? null
  },

  /** Every handoff this job has ever had, newest first — typically one
   *  (the common case), but can be several for a job that's been
   *  completed, cleared, reverted, and completed again. */
  findHistoryBySourceJobId(jobId: string): BillingHandoffRow[] {
    return db.prepare("SELECT * FROM BillingHandoff WHERE sourceJobId = ? ORDER BY createdAt DESC").all(jobId) as BillingHandoffRow[]
  },

  /** Set quote value on an uncleared handoff and its source job (Awaiting tab). */
  updateQuoteValue(handoffId: string, quoteValue: number): BillingHandoffRow | { error: string } {
    const handoff = this.findUnique(handoffId)
    if (!handoff) return { error: "Not found" }
    if (handoff.clearedByAccountsAt) return { error: "Cannot edit a cleared item" }
    if (quoteValue < 0) return { error: "Value cannot be negative" }

    const now = nowIso()
    db.transaction(() => {
      db.prepare('UPDATE Job SET quoteValue = ?, "updatedAt" = ? WHERE id = ?').run(quoteValue, now, handoff.sourceJobId)
      const job = jobDb.findUnique(handoff.sourceJobId)!
      const snapshotValue = totalJobCommercialValue(job) ?? quoteValue
      db.prepare('UPDATE BillingHandoff SET quoteValue = ?, "updatedAt" = ? WHERE id = ?').run(snapshotValue, now, handoffId)
    })()
    return this.findUnique(handoffId)!
  },

  /**
   * Builds the full Accounts Handover snapshot for one handoff — everything
   * accounts should need without coming back to the application. Evaluated
   * fresh at export time (per the "snapshot at the moment it is processed"
   * requirement) by joining live to Job/Client/StatusHistory/sibling
   * revisions, then frozen forever once written to BillingExportSnapshot.
   *
   * Fields that don't exist anywhere in this application's data model
   * (priority, a surveyor role distinct from designer, project lead, PO
   * number, cost centre, additional charges/variations as line items,
   * attachments) are explicitly marked rather than guessed at or left
   * silently blank — see `notTracked`.
   */
  buildAccountsHandoverSnapshot(handoff: BillingHandoffRow): AccountsHandoverSnapshot {
    const job    = jobDb.findUnique(handoff.sourceJobId)
    const client = job?.clientId ? clientDb.findUnique(job.clientId) : null
    const history = job ? historyDb.forJob(job.id) : []   // oldest first (ASC)
    const createdEntry   = history.find(h => h.fromStatus === null)
    const completedEntry = [...history].reverse().find(h => h.toStatus === "ISSUED")
    const lastEntry       = history[history.length - 1]   // most recent entry

    // Real, if modest, enhancement: if this job was converted from a quote,
    // the quote's free-text description is a genuine "Project Description"
    // — something this job's own record has no field for, but the
    // originating quote does. Falls back to null if there's no
    // quoteReference or the quote can't be found (e.g. very old data).
    const sourceQuote = job?.quoteReference ? quoteDb.findByNumber(job.quoteReference) : null

    const revisions = job ? jobDb.revisionsForJob(job.id) : []
    const revisionHistory = revisions.map(r => ({
      drawingNumber:  r.drawingNumber,
      revisionLetter: r.revisionLetter,
      status:         r.status,
      requestedDate:  r.dateCreated,
      completionDate: r.dateCompleted,
      description:    r.notes,
      charge:         r.quoteValue,
    }))
    const revisionChargesTotal = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)

    const notTracked = [
      "Billing Contact (distinct from Contact Name)",
      "Priority",
      "Request Source",
      "Internal References",
      "Purchase Order Number",
      "Cost Centre",
      "Payment Terms",
      "Surveyor (distinct role from Designer), Survey Date, Survey Notes, Survey References — this application does not track a separate survey workflow from the design workflow, even for itemType='SURVEY' jobs",
      "Attachments / Documents — this application has no file upload or document storage of any kind",
      "Description (distinct from Type of Works) for standard categories — only 'Other'-type jobs have a free-text description; Project Description above is populated only when this job was converted from a quote with its own description",
    ]

    return {
      handoffId:       handoff.id,
      billingEventType: handoff.billingEventType,
      client: {
        clientName:    client?.name ?? handoff.clientCompany,
        companyName:   client?.name ?? handoff.clientCompany,
        contactName:   client?.contactName ?? job?.requestedBy ?? null,
        contactEmail:  client?.email ?? null,
        contactTelephone: client?.phone ?? null,
        billingContact: null,   // not tracked — see notTracked
        billingAddress: client?.billingAddress ?? null,
        clientNotes:    client?.notes ?? null,
      },
      project: {
        jobNumber:      handoff.drawingNumber,
        drawingNumber:  handoff.drawingNumber,   // same underlying value — see interface comment
        // "Other" on its own tells accounts nothing useful — show the real
        // description that was captured for it instead, falling back to the
        // literal value only if somehow no description was ever recorded.
        projectName:    (job?.typeOfWorks ?? handoff.typeOfWorks) === "Other"
          ? (job?.customTypeDescription ?? handoff.customTypeDescription ?? "Other")
          : (job?.typeOfWorks ?? handoff.typeOfWorks ?? null),
        projectDescription: sourceQuote?.description ?? null,
        siteAddress:    job?.address ?? handoff.address,
        typeOfWorks:    job?.typeOfWorks ?? handoff.typeOfWorks ?? null,
        otherTypeDescription: (job?.typeOfWorks ?? handoff.typeOfWorks) === "Other"
          ? (job?.customTypeDescription ?? handoff.customTypeDescription ?? null)
          : null,
        allNotes:       job?.notes ?? null,
        jobStatus:      job?.status ?? "ISSUED",
        priority:       null,   // not tracked — see notTracked
        creationDate:   job?.dateCreated ?? handoff.createdAt,
        dueDate:        job?.requiredByDate ?? null,
        completionDate: handoff.completionDate,
      },
      request: {
        requestedBy:            job?.requestedBy ?? null,
        companyRequestingWorks: handoff.clientCompany,
        // Job.requestedDate exists as a column but the UI stopped showing or
        // setting it some time ago (see PROJECT_OVERVIEW.md §11) — it's
        // included here in case it's populated on older records, not
        // because it's reliably populated going forward.
        requestDate:            job?.requestedDate ?? null,
        requestSource:          null,   // not tracked — see notTracked
        internalReferences:     null,   // not tracked — see notTracked
        purchaseOrderNumber:    null,   // not tracked — see notTracked
        costCentre:             null,   // not tracked — see notTracked
      },
      commercial: {
        agreedFee:        totalJobCommercialValue(job ?? {}) ?? handoff.quoteValue,
        quotedFee:        job?.quoteValue ?? handoff.quoteValue,
        quoteReference:   job?.quoteReference ?? handoff.quoteReference ?? null,
        variationFees:    job?.variationFees ?? null,
        additionalCharges: job?.additionalCharges ?? null,
        revisionCharges:  revisions.length ? revisionChargesTotal : null,
        commercialNotes:  job?.commercialNotes ?? null,
        paymentTerms:     null,   // not tracked — see notTracked
      },
      design: {
        assignedDesigner:      handoff.designer,
        completedBy:           completedEntry?.changedBy ?? null,
        designCompletionDate:  handoff.completionDate,
        designNotes:           job?.notes ?? null,
        designReference:       handoff.drawingNumber,
      },
      survey: {
        assignedSurveyor: null,   // not tracked — see notTracked
        surveyDate:        null,
        surveyNotes:        null,
        surveyReferences:   null,
      },
      revisions: {
        revisionCount: revisions.length,
        history:       revisionHistory,
      },
      audit: {
        createdBy:        createdEntry?.changedBy ?? null,
        createdDate:      job?.dateCreated ?? handoff.createdAt,
        // Best-effort: the most recent recorded status-history entry, which
        // covers status changes, designer assignment, and similar tracked
        // events — not necessarily every field edit (e.g. editing notes or
        // address alone doesn't write a StatusHistory row).
        lastModifiedBy:   lastEntry?.changedBy ?? null,
        lastModifiedDate: job?.updatedAt ?? handoff.updatedAt,
        addedToQueueAt:   handoff.addedToBillingQueueAt,
        fullHistory:      history.map(h => ({
          fromStatus: h.fromStatus, toStatus: h.toStatus, changedBy: h.changedBy, changedAt: h.changedAt, note: h.note,
        })),
      },
      attachments: {
        note:  "This application has no file upload or document storage — no attachment metadata exists to export.",
        items: [] as { fileName: string; reference: string; uploadedAt: string }[],
      },
      notTracked,
    }
  },

  /**
   * Creates an Accounts Handover export batch for the given handoff ids:
   * builds and permanently stores a snapshot for each, marks each handoff
   * cleared and linked to the batch, and returns the batch plus the
   * snapshots (for building the XLSX response). All-or-nothing — if any
   * handoff is invalid or already cleared, nothing is written.
   */
  createExportBatch(data: { handoffIds: string[]; exportedBy: string; exportDate: string; notes?: string | null }): { batch: BillingExportBatchRow; snapshots: AccountsHandoverSnapshot[] } {
    if (!data.handoffIds.length) throw new Error("No items selected for export")

    const handoffs = this.findManyByIds(data.handoffIds)
    const byId = new Map(handoffs.map(h => [h.id, h]))
    for (const id of data.handoffIds) {
      const h = byId.get(id)
      if (!h) throw new Error(`Item ${id} not found`)
      if (h.clearedByAccountsAt) throw new Error(`${h.drawingNumber} has already been cleared`)
    }
    const orderedHandoffs = data.handoffIds.map(id => byId.get(id)!)

    const batchId     = nanoid()
    const batchNumber = sequenceDb.nextRefNumber("BATCH")
    const now         = nowIso()
    const snapshots = orderedHandoffs.map(h => this.buildAccountsHandoverSnapshot(h))

    db.transaction(() => {
      db.prepare(`
        INSERT INTO BillingExportBatch (id, batchNumber, exportDate, exportedBy, recordCount, notes, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(batchId, batchNumber, data.exportDate, data.exportedBy, orderedHandoffs.length, data.notes ?? null, now)

      orderedHandoffs.forEach((h, i) => {
        db.prepare(`
          INSERT INTO BillingExportSnapshot (id, batchId, handoffId, snapshotJson, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(nanoid(), batchId, h.id, JSON.stringify(snapshots[i]), now)

        db.prepare(`
          UPDATE BillingHandoff
          SET clearedByAccountsAt = ?, clearedBy = ?, exportBatchId = ?, notes = COALESCE(?, notes), "updatedAt" = ?
          WHERE id = ? AND clearedByAccountsAt IS NULL
        `).run(now, data.exportedBy, batchId, data.notes ?? null, now, h.id)
      })
    })()

    return { batch: this.findBatchUnique(batchId)!, snapshots }
  },

  findBatchUnique(id: string): BillingExportBatchRow | null {
    return (db.prepare("SELECT * FROM BillingExportBatch WHERE id = ?").get(id) as BillingExportBatchRow) ?? null
  },

  findBatches(opts: { skip?: number; take?: number } = {}): BillingExportBatchRow[] {
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM BillingExportBatch ORDER BY createdAt DESC ${limit} ${offset}`).all() as BillingExportBatchRow[]
  },

  handoffsForBatch(batchId: string): BillingHandoffRow[] {
    return db.prepare("SELECT * FROM BillingHandoff WHERE exportBatchId = ? ORDER BY drawingNumber ASC").all(batchId) as BillingHandoffRow[]
  },

  /** Re-loads the exact, frozen snapshots written for a batch — used to
   *  re-download a past export byte-for-byte, without touching live Job
   *  data (which may have changed since the export happened). */
  snapshotsForBatch(batchId: string): AccountsHandoverSnapshot[] {
    const rows = db.prepare(`
      SELECT bes.snapshotJson FROM BillingExportSnapshot bes
      JOIN BillingHandoff bh ON bh.id = bes.handoffId
      WHERE bes.batchId = ?
      ORDER BY bh.drawingNumber ASC
    `).all(batchId) as { snapshotJson: string }[]
    return rows.map(r => JSON.parse(r.snapshotJson) as AccountsHandoverSnapshot)
  },

  /** Summary for the dashboard KPI and /api/stats */
  stats(): { awaitingCount: number; awaitingValue: number; clearedCount: number } {
    const awaiting = db.prepare(
      "SELECT COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v FROM BillingHandoff WHERE clearedByAccountsAt IS NULL"
    ).get() as { n: number; v: number }
    const clearedCount = (db.prepare(
      "SELECT COUNT(*) as n FROM BillingHandoff WHERE clearedByAccountsAt IS NOT NULL"
    ).get() as { n: number }).n
    return { awaitingCount: awaiting.n, awaitingValue: awaiting.v, clearedCount }
  },
}

// ── Commercial aggregates ────────────────────────────────────────
// Used by /api/stats to power the Dashboard's Admin-only "total quoted" /
// "total issued" glance figures (redacted for Engineers via
// canViewCommercialValues() in lib/permissions.ts). The Commercial report
// page that used to additionally surface a monthly breakdown and a
// jobs-by-value list has been removed — those functions went with it.

export const commercialDb = {
  totalQuotedValue(): number { return (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE quoteValue > 0").get() as { v: number }).v },
  totalIssuedValue(): number { return (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE status='ISSUED' AND quoteValue > 0").get() as { v: number }).v },
  avgJobValue():      number { return (db.prepare("SELECT COALESCE(AVG(quoteValue),0) as v FROM Job WHERE quoteValue > 0").get() as { v: number }).v },
}


// ── Client types ─────────────────────────────────────────────────

export type { ClientRow, CreateClientData, UpdateClientData } from "./client-types"
import type { ClientRow, CreateClientData, UpdateClientData } from "./client-types"

// ── Client queries ────────────────────────────────────────────────

export const clientDb = {
  findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): ClientRow[] {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(nameLower LIKE ? OR contactName LIKE ? OR email LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s)
    }
    if (opts.activeOnly) { clauses.push("active = 1") }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Client ${w} ORDER BY name ASC ${limit} ${offset}`)
             .all(...params) as ClientRow[]
  },

  /** Same as findMany, but adds activeJobCount and onHold via subqueries — feeds the clients
   *  list page so hold status and workload are visible without opening each client. */
  findManyWithMeta(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): (ClientRow & { activeJobCount: number; onHold: boolean })[] {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(c.nameLower LIKE ? OR c.contactName LIKE ? OR c.email LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s)
    }
    if (opts.activeOnly) { clauses.push("c.active = 1") }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    const rows = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM Job j WHERE j.clientId = c.id AND j.status != 'ISSUED') as activeJobCount,
        (SELECT COUNT(*) FROM ClientHold h WHERE h.clientId = c.id AND h.status = 'ACTIVE') as onHoldCount
      FROM Client c ${w} ORDER BY c.name ASC ${limit} ${offset}
    `).all(...params) as (ClientRow & { activeJobCount: number; onHoldCount: number })[]
    return rows.map(({ onHoldCount, ...r }) => ({ ...r, onHold: onHoldCount > 0 }))
  },
  count(opts: { search?: string; activeOnly?: boolean } = {}): number {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(nameLower LIKE ? OR contactName LIKE ? OR email LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s)
    }
    if (opts.activeOnly) { clauses.push("active = 1") }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Client ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): ClientRow | null {
    return (db.prepare("SELECT * FROM Client WHERE id = ?").get(id) as ClientRow) ?? null
  },

  findByName(name: string): ClientRow | null {
    return (db.prepare("SELECT * FROM Client WHERE nameLower = ?").get(name.trim().toLowerCase()) as ClientRow) ?? null
  },

  /** Fuzzy name search — returns clients whose name contains any word of the query */
  search(q: string, limit = 10): ClientRow[] {
    const lower = q.trim().toLowerCase()
    if (!lower) return this.findMany({ activeOnly: true, take: limit })
    return db.prepare("SELECT * FROM Client WHERE nameLower LIKE ? AND active = 1 ORDER BY name ASC LIMIT ?")
             .all(`%${lower}%`, limit) as ClientRow[]
  },

  create(data: CreateClientData): ClientRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO Client (id,name,nameLower,contactName,email,phone,billingAddress,notes,accountCode,active,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
    `).run(
      data.id, data.name.trim(), data.name.trim().toLowerCase(),
      data.contactName?.trim() || null, data.email?.trim() || null,
      data.phone?.trim() || null, data.billingAddress?.trim() || null,
      data.notes?.trim() || null, data.accountCode?.trim() || null, now, now
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateClientData): ClientRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    const isRename = data.name !== undefined && data.name.trim() !== existing.name
    if (data.name !== undefined) {
      fields.push('"name" = ?', '"nameLower" = ?')
      params.push(data.name.trim(), data.name.trim().toLowerCase())
    }
    const simple: (keyof UpdateClientData)[] = ["contactName","email","phone","billingAddress","notes","accountCode","active"]
    for (const k of simple) {
      if (data[k] !== undefined) { fields.push(`"${k}" = ?`); params.push(data[k] ?? null) }
    }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.transaction(() => {
      db.prepare(`UPDATE Client SET ${fields.join(", ")} WHERE id = ?`).run(...params)
      // clientCompany is a denormalized copy of Client.name kept on Job/Quote rows for
      // backwards-compatible filtering and display — see PROJECT_OVERVIEW.md §6. It must
      // never drift from the Client record once a row is linked via clientId.
      if (isRename) {
        const now = nowIso()
        db.prepare('UPDATE Job SET "clientCompany" = ?, "updatedAt" = ? WHERE clientId = ?')
          .run(data.name!.trim(), now, id)
        db.prepare('UPDATE Quote SET "clientCompany" = ?, "updatedAt" = ? WHERE clientId = ?')
          .run(data.name!.trim(), now, id)
      }
    })()
    return this.findUnique(id)
  },

  archive(id: string): ClientRow | null {
    return this.update(id, { active: 0 })
  },

  restore(id: string): ClientRow | null {
    return this.update(id, { active: 1 })
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM Client WHERE id = ?").run(id).changes > 0
  },

  /** Stats for the client detail page */
  stats(clientId: string): {
    totalJobs:        number
    activeJobs:       number
    issuedJobs:       number
    totalRevisions:   number
    totalQuotedValue: number
    totalInvoicedValue: number
  } {
    const totalJobs          = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ?").get(clientId) as { n: number }).n
    const activeJobs         = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status NOT IN ('ISSUED')").get(clientId) as { n: number }).n
    const issuedJobs         = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status = 'ISSUED'").get(clientId) as { n: number }).n
    const totalRevisions     = (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND itemType = 'REVISION'").get(clientId) as { n: number }).n
    const totalQuotedValue   = (db.prepare("SELECT COALESCE(SUM(quoteValue),0) as v FROM Job WHERE clientId = ? AND quoteValue > 0").get(clientId) as { v: number }).v
    const totalInvoicedValue = (db.prepare("SELECT COALESCE(SUM(ii.value),0) as v FROM InvoiceItem ii JOIN Job j ON j.id = ii.jobId WHERE j.clientId = ?").get(clientId) as { v: number }).v
    return { totalJobs, activeJobs, issuedJobs, totalRevisions, totalQuotedValue, totalInvoicedValue }
  },

  /** Jobs for a client (all item types) */
  jobsForClient(clientId: string, limit = 50): JobRow[] {
    return db.prepare("SELECT * FROM Job WHERE clientId = ? ORDER BY createdAt DESC LIMIT ?")
             .all(clientId, limit) as JobRow[]
  },
}

// ── Client migration ──────────────────────────────────────────────
// Runs once: creates Client records from existing clientCompany strings,
// then back-populates Job.clientId. Idempotent. Skipped on a brand-new DB
// or during the Next.js build phase where no database is available.
if (DB_EXISTED) {
  try {
    ;(function migrateClientsFromJobs() {
      const distinct = db.prepare(
        "SELECT DISTINCT clientCompany FROM Job WHERE clientCompany != '' AND clientId IS NULL ORDER BY clientCompany ASC"
      ).all() as { clientCompany: string }[]

      if (!distinct.length) return

      db.transaction(() => {
        for (const { clientCompany } of distinct) {
          const name = clientCompany.trim()
          if (!name) continue
          const nameLower = name.toLowerCase()
          const now = nowIso()

          // Find or create client record
          let client = db.prepare("SELECT id FROM Client WHERE nameLower = ?").get(nameLower) as { id: string } | undefined
          if (!client) {
            const newId = nanoid()
            db.prepare(`
              INSERT INTO Client (id,name,nameLower,active,createdAt,updatedAt)
              VALUES (?,?,?,1,?,?)
            `).run(newId, name, nameLower, now, now)
            client = { id: newId }
          }

          // Back-populate clientId on all matching jobs
          db.prepare("UPDATE Job SET clientId = ? WHERE clientCompany = ? AND clientId IS NULL")
            .run(client.id, clientCompany)
        }
      })()
    })()
  } catch {
    // Silently skip if tables aren't ready yet (e.g. mid-migration or build time)
  }
}


// ── ExportBatch types ─────────────────────────────────────────────

export interface ExportBatchRow {
  id:          string
  batchNumber: string
  exportDate:  string
  exportedBy:  string
  itemCount:   number
  totalValue:  number
  notes:       string | null
  createdAt:   string
}

export interface ExportBatchItemRow {
  id:            string
  batchId:       string
  jobId:         string
  drawingNumber: string
  clientCompany: string
  itemType:      string
  address:       string
  quoteValue:    number | null
  exportedAt:    string
}

// ── Export Batch queries ──────────────────────────────────────────

export const exportBatchDb = {
  /** Next batch number: BATCH-YYYY-NNN */
  nextBatchNumber(): string {
    const year = new Date().getFullYear()
    const run  = db.transaction((): number => {
      const existing = db.prepare("SELECT seq FROM RefSequence WHERE prefix = 'BATCH' AND year = ?").get(year) as { seq: number } | undefined
      if (existing) {
        const next = existing.seq + 1
        db.prepare("UPDATE RefSequence SET seq = ? WHERE prefix = 'BATCH' AND year = ?").run(next, year)
        return next
      } else {
        db.prepare("INSERT INTO RefSequence (id,prefix,year,seq) VALUES (?,?,?,1)").run(nanoid(), "BATCH", year)
        return 1
      }
    })
    return `BATCH-${year}-${String(run()).padStart(3, "0")}`
  },

  /**
   * Create an export batch for the given job IDs.
   * Marks each job with billingStatus = 'EXPORTED_TO_ACCOUNTS' and billingBatchId.
   * Returns the created batch and its items.
   * NEVER deletes records — full audit trail preserved.
   */
  createBatch(data: {
    jobIds:     string[]
    exportedBy: string
    exportDate: string
    notes?:     string | null
  }): { batch: ExportBatchRow; items: ExportBatchItemRow[] } {
    if (!data.jobIds.length) throw new Error("No jobs provided for export batch")

    const id          = nanoid()
    const batchNumber = this.nextBatchNumber()
    const now         = nowIso()

    // Fetch all jobs first to compute totals
    const jobs: JobRow[] = []
    for (const jobId of data.jobIds) {
      const j = jobDb.findUnique(jobId)
      if (!j) throw new Error(`Job ${jobId} not found`)
      if (j.status !== "ISSUED") throw new Error(`${j.drawingNumber} is not Issued`)
      if (j.billingStatus === "EXPORTED_TO_ACCOUNTS") throw new Error(`${j.drawingNumber} is already exported`)
      jobs.push(j)
    }

    const totalValue = jobs.reduce((sum, j) => sum + (j.quoteValue ?? 0), 0)
    const itemCount  = jobs.length

    db.transaction(() => {
      // Create batch header
      db.prepare(`
        INSERT INTO ExportBatch (id,batchNumber,exportDate,exportedBy,itemCount,totalValue,notes,createdAt)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(id, batchNumber, data.exportDate, data.exportedBy, itemCount, totalValue, data.notes ?? null, now)

      // Create batch items + mark jobs
      for (const job of jobs) {
        db.prepare(`
          INSERT INTO ExportBatchItem (id,batchId,jobId,drawingNumber,clientCompany,itemType,address,quoteValue,exportedAt)
          VALUES (?,?,?,?,?,?,?,?,?)
        `).run(nanoid(), id, job.id, job.drawingNumber, job.clientCompany,
               job.itemType, job.address, job.quoteValue ?? null, now)

        db.prepare(`UPDATE Job SET billingStatus = 'EXPORTED_TO_ACCOUNTS', billingBatchId = ?, "updatedAt" = ? WHERE id = ?`)
          .run(id, now, job.id)

        // Audit trail on the job's status history
        db.prepare(`INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt,note) VALUES (?,?,?,?,?,?,?)`)
          .run(nanoid(), job.id, "ISSUED", "ISSUED", data.exportedBy, now,
               `Exported to accounts: ${batchNumber}`)
      }
    })()

    const batch = this.findUnique(id)!
    const items = this.itemsForBatch(id)
    return { batch, items }
  },

  findMany(opts: { skip?: number; take?: number } = {}): ExportBatchRow[] {
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM ExportBatch ORDER BY createdAt DESC ${limit} ${offset}`)
             .all() as ExportBatchRow[]
  },

  count(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM ExportBatch").get() as { n: number }).n
  },

  findUnique(id: string): ExportBatchRow | null {
    return (db.prepare("SELECT * FROM ExportBatch WHERE id = ?").get(id) as ExportBatchRow) ?? null
  },

  findByNumber(batchNumber: string): ExportBatchRow | null {
    return (db.prepare("SELECT * FROM ExportBatch WHERE batchNumber = ?").get(batchNumber) as ExportBatchRow) ?? null
  },

  itemsForBatch(batchId: string): ExportBatchItemRow[] {
    return db.prepare(
      "SELECT * FROM ExportBatchItem WHERE batchId = ? ORDER BY clientCompany ASC, drawingNumber ASC"
    ).all(batchId) as ExportBatchItemRow[]
  },

  /** Summary stats for dashboard */
  billingStats(): {
    pendingCount:   number
    pendingValue:   number
    exportedCount:  number
    exportedValue:  number
  } {
    const pending  = db.prepare(`
      SELECT COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v
      FROM Job WHERE status = 'ISSUED' AND invoiceId IS NULL
        AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')
    `).get() as { n: number; v: number }

    const exported = db.prepare(`
      SELECT COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v
      FROM Job WHERE billingStatus = 'EXPORTED_TO_ACCOUNTS'
    `).get() as { n: number; v: number }

    return {
      pendingCount:  pending.n,
      pendingValue:  pending.v,
      exportedCount: exported.n,
      exportedValue: exported.v,
    }
  },
}


export type { ClientHoldRow, ClientHoldWithClientRow } from "./hold-types"
import type { ClientHoldRow, ClientHoldWithClientRow } from "./hold-types"

export const holdDb = {
  /** Active hold for a client, if any */
  activeHoldForClient(clientId: string): ClientHoldRow | null {
    return (db.prepare(
      "SELECT * FROM ClientHold WHERE clientId = ? AND status = 'ACTIVE' ORDER BY addedAt DESC LIMIT 1"
    ).get(clientId) as ClientHoldRow) ?? null
  },

  /** Batched version of activeHoldForClient for a list of ids — one query instead of N,
   *  for places like /api/clients/search that need to annotate many results at once. */
  activeHoldReasonsFor(clientIds: string[]): { clientId: string; reason: string }[] {
    if (!clientIds.length) return []
    const placeholders = clientIds.map(() => "?").join(",")
    return db.prepare(
      `SELECT clientId, reason FROM ClientHold WHERE status = 'ACTIVE' AND clientId IN (${placeholders})`
    ).all(...clientIds) as { clientId: string; reason: string }[]
  },

  /** Full hold history for a client */
  historyForClient(clientId: string): ClientHoldRow[] {
    return db.prepare(
      "SELECT * FROM ClientHold WHERE clientId = ? ORDER BY addedAt DESC"
    ).all(clientId) as ClientHoldRow[]
  },

  /** All active holds (for the hold list page) */
  allActive(): ClientHoldWithClientRow[] {
    return db.prepare(`
      SELECT ch.*,
             c.name         AS clientName,
             COALESCE((SELECT COUNT(*) FROM Job j WHERE j.clientId = ch.clientId AND j.status NOT IN ('ISSUED')), 0) AS activeJobCount,
             COALESCE((SELECT SUM(j.quoteValue) FROM Job j WHERE j.clientId = ch.clientId AND j.quoteValue > 0), 0)  AS quoteValueTotal
      FROM ClientHold ch
      JOIN Client c ON c.id = ch.clientId
      WHERE ch.status = 'ACTIVE'
      ORDER BY ch.addedAt DESC
    `).all() as ClientHoldWithClientRow[]
  },

  /** Count of clients currently on hold — for dashboard */
  activeCount(): number {
    return (db.prepare(
      "SELECT COUNT(DISTINCT clientId) as n FROM ClientHold WHERE status = 'ACTIVE'"
    ).get() as { n: number }).n
  },

  /** Place a client on hold — idempotent (skips if already active) */
  addHold(data: {
    clientId: string
    reason:   string
    notes?:   string | null
    addedBy:  string
  }): ClientHoldRow {
    // If there's already an active hold, update it
    const existing = this.activeHoldForClient(data.clientId)
    const now = nowIso()
    if (existing) {
      db.prepare(
        "UPDATE ClientHold SET reason = ?, notes = ?, addedBy = ?, addedAt = ? WHERE id = ?"
      ).run(data.reason.trim(), data.notes?.trim() ?? null, data.addedBy, now, existing.id)
      return db.prepare("SELECT * FROM ClientHold WHERE id = ?").get(existing.id) as ClientHoldRow
    }
    const id = nanoid()
    db.prepare(`
      INSERT INTO ClientHold (id,clientId,status,reason,notes,addedBy,addedAt)
      VALUES (?,?,  'ACTIVE',?,?,?,?)
    `).run(id, data.clientId, data.reason.trim(), data.notes?.trim() ?? null, data.addedBy, now)
    return db.prepare("SELECT * FROM ClientHold WHERE id = ?").get(id) as ClientHoldRow
  },

  /** Remove a client from hold (sets status=REMOVED, never deletes) */
  removeHold(data: {
    clientId:      string
    removedBy:     string
    removedReason?: string | null
  }): ClientHoldRow | null {
    const existing = this.activeHoldForClient(data.clientId)
    if (!existing) return null
    const now = nowIso()
    db.prepare(`
      UPDATE ClientHold
      SET status = 'REMOVED', removedBy = ?, removedAt = ?, removedReason = ?
      WHERE id = ?
    `).run(data.removedBy, now, data.removedReason?.trim() ?? null, existing.id)
    return db.prepare("SELECT * FROM ClientHold WHERE id = ?").get(existing.id) as ClientHoldRow
  },
}



// ── Health check ──────────────────────────────────────────────────

export function dbHealthCheck() {
  try {
    const jobs    = (db.prepare("SELECT COUNT(*) as n FROM Job").get() as { n: number }).n
    const history = (db.prepare("SELECT COUNT(*) as n FROM StatusHistory").get() as { n: number }).n
    return { ok: true, jobCount: jobs, historyCount: history, path: DB_PATH }
  } catch {
    return { ok: false, jobCount: -1, historyCount: -1, path: DB_PATH }
  }
}

export type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
} from "./quote-types"
import type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
} from "./quote-types"

// ── Quote queries ─────────────────────────────────────────────────

export const quoteLineItemDb = {
  findForQuote(quoteId: string): QuoteLineItemRow[] {
    return db.prepare("SELECT * FROM QuoteLineItem WHERE quoteId = ? ORDER BY sortOrder ASC, createdAt ASC").all(quoteId) as QuoteLineItemRow[]
  },

  /** Replaces every line item for a quote in one go — simplest correct
   *  semantics for "save this quote's line items" from a form that submits
   *  the whole list at once; avoids needing a separate add/remove/reorder
   *  API for what's edited as a single unit in the UI. */
  replaceForQuote(quoteId: string, items: CreateQuoteLineItemData[]) {
    db.transaction(() => {
      db.prepare("DELETE FROM QuoteLineItem WHERE quoteId = ?").run(quoteId)
      items.forEach((item, i) => {
        db.prepare(`
          INSERT INTO QuoteLineItem (id, quoteId, description, amount, vatApplicable, sortOrder, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(nanoid(), quoteId, item.description.trim(), item.amount, item.vatApplicable === false ? 0 : 1, item.sortOrder ?? i, nowIso())
      })
    })()
  },
}

export const quoteDb = {
  findByNumber(quoteNumber: string): QuoteRow | null {
    return (db.prepare("SELECT * FROM Quote WHERE quoteNumber = ?").get(quoteNumber) as QuoteRow) ?? null
  },

  findMany(opts: { search?: string; status?: string; clientId?: string; skip?: number; take?: number } = {}): QuoteRow[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search) {
      const pat = `%${opts.search}%`
      clauses.push("(quoteNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR description LIKE ? OR typeOfWorks LIKE ? OR customTypeDescription LIKE ?)")
      params.push(pat, pat, pat, pat, pat, pat)
    }
    if (opts.status)   { clauses.push("status = ?");   params.push(opts.status) }
    if (opts.clientId) { clauses.push("clientId = ?"); params.push(opts.clientId) }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Quote ${w} ORDER BY createdAt DESC ${limit} ${offset}`).all(...params) as QuoteRow[]
  },

  count(opts: { search?: string; status?: string; clientId?: string } = {}): number {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search) {
      const pat = `%${opts.search}%`
      clauses.push("(quoteNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR description LIKE ? OR typeOfWorks LIKE ? OR customTypeDescription LIKE ?)")
      params.push(pat, pat, pat, pat, pat, pat)
    }
    if (opts.status)   { clauses.push("status = ?");   params.push(opts.status) }
    if (opts.clientId) { clauses.push("clientId = ?"); params.push(opts.clientId) }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Quote ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): QuoteRow | null {
    return (db.prepare("SELECT * FROM Quote WHERE id = ?").get(id) as QuoteRow) ?? null
  },

  create(data: CreateQuoteData): QuoteRow {
    const id          = nanoid()
    const quoteNumber = sequenceDb.nextRefNumber("Q")
    const now         = nowIso()
    db.prepare(`
      INSERT INTO Quote
        (id,quoteNumber,clientId,clientCompany,contactName,address,description,
         typeOfWorks,customTypeDescription,
         quoteValue,quoteDate,expiryDate,status,notes,createdBy,vatRate,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, quoteNumber,
      data.clientId ?? null,
      data.clientCompany.trim(),
      data.contactName?.trim() || null,
      data.address.trim(),
      data.description.trim(),
      data.typeOfWorks?.trim() || null,
      data.customTypeDescription?.trim() || null,
      data.quoteValue,
      data.quoteDate,
      data.expiryDate ?? null,
      data.status ?? "DRAFT",
      data.notes?.trim() || null,
      data.createdBy ?? "System",
      data.vatRate ?? null,
      now, now
    )
    return this.findUnique(id)!
  },

  update(id: string, data: UpdateQuoteData): QuoteRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    const cols: (keyof UpdateQuoteData)[] = [
      "clientId","clientCompany","contactName","address","description",
      "typeOfWorks","customTypeDescription",
      "quoteValue","quoteDate","expiryDate","status","notes","jobId",
      "pdfPath","preparedBy","vatRate",
    ]
    for (const k of cols) {
      if (data[k] !== undefined) { fields.push(`"${k}" = ?`); params.push(data[k] ?? null) }
    }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?')
    params.push(nowIso(), id)
    db.prepare(`UPDATE Quote SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return this.findUnique(id)
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM Quote WHERE id = ?").run(id).changes > 0
  },

  countExpiredDeletable(): number {
    return (db.prepare(`
      SELECT COUNT(*) as n FROM Quote
      WHERE status = 'EXPIRED' AND jobId IS NULL
    `).get() as { n: number }).n
  },

  /** Delete EXPIRED quotes that were never converted to a job. */
  deleteExpired(): QuoteRow[] {
    const candidates = db.prepare(`
      SELECT * FROM Quote
      WHERE status = 'EXPIRED' AND jobId IS NULL
    `).all() as QuoteRow[]

    const deleted: QuoteRow[] = []
    for (const q of candidates) {
      if (this.delete(q.id)) deleted.push(q)
    }
    return deleted
  },

  /** Mark open quotes past expiryDate as EXPIRED. Idempotent. */
  expirePastDue(asOf: string = todayIsoDate()): QuoteRow[] {
    const candidates = db.prepare(`
      SELECT * FROM Quote
      WHERE status IN ('DRAFT', 'SENT')
        AND expiryDate IS NOT NULL
        AND substr(expiryDate, 1, 10) < ?
    `).all(asOf) as QuoteRow[]

    const expired: QuoteRow[] = []
    for (const q of candidates) {
      const updated = this.update(q.id, { status: "EXPIRED" })
      if (updated) expired.push(updated)
    }
    return expired
  },

  /** Open quotes expiring within the next 7 days (inclusive). */
  countExpiringSoon(asOf: string = todayIsoDate()): number {
    const inSeven = addDaysToIsoDate(new Date(asOf + "T00:00:00"), 7)
    return (db.prepare(`
      SELECT COUNT(*) as n FROM Quote
      WHERE status IN ('DRAFT', 'SENT')
        AND expiryDate IS NOT NULL
        AND substr(expiryDate, 1, 10) >= ?
        AND substr(expiryDate, 1, 10) <= ?
    `).get(asOf, inSeven) as { n: number }).n
  },

  stats(): {
    total:          number
    draft:          number
    sent:           number
    accepted:       number
    rejected:       number
    expired:        number
    totalValue:     number
    acceptedValue:  number
    conversionRate: number
  } {
    const rows = db.prepare(
      "SELECT status, COUNT(*) as n, COALESCE(SUM(quoteValue),0) as v FROM Quote GROUP BY status"
    ).all() as { status: string; n: number; v: number }[]
    const cnt = (s: string) => rows.find(r => r.status === s)?.n ?? 0
    const val = (s: string) => rows.find(r => r.status === s)?.v ?? 0
    const accepted = cnt("ACCEPTED")
    const rejected = cnt("REJECTED")
    const decided  = accepted + rejected
    return {
      total:          rows.reduce((a, b) => a + b.n, 0),
      draft:          cnt("DRAFT"),
      sent:           cnt("SENT"),
      accepted,
      rejected,
      expired:        cnt("EXPIRED"),
      totalValue:     rows.reduce((a, b) => a + b.v, 0),
      acceptedValue:  val("ACCEPTED"),
      conversionRate: decided > 0 ? accepted / decided : 0,
    }
  },
}

// ── Users ────────────────────────────────────────────────────────────
// Minimal user directory backing the role-based permissions system.
// There is no password/session here yet — see lib/auth.ts for the
// pre-authentication "switch user" seam that real login will replace
// without needing to touch this table or these queries.
export const userDb = {
  findMany(opts: { activeOnly?: boolean } = {}): UserRow[] {
    const where = opts.activeOnly ? "WHERE active = 1" : ""
    return db.prepare(`SELECT * FROM User ${where} ORDER BY name ASC`).all() as UserRow[]
  },

  findUnique(id: string): UserRow | null {
    return (db.prepare("SELECT * FROM User WHERE id = ?").get(id) as UserRow) ?? null
  },

  findByEmail(email: string): UserRow | null {
    const lower = email.trim().toLowerCase()
    if (!lower) return null
    return (db.prepare("SELECT * FROM User WHERE emailLower = ?").get(lower) as UserRow) ?? null
  },

  count(opts: { activeOnly?: boolean } = {}): number {
    const where = opts.activeOnly ? "WHERE active = 1" : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM User ${where}`).get() as { n: number }).n
  },

  /** Count active users with the ADMIN role — used to stop the last admin being demoted/disabled */
  activeAdminCount(): number {
    return (db.prepare("SELECT COUNT(*) as n FROM User WHERE role = 'ADMIN' AND active = 1").get() as { n: number }).n
  },

  create(data: CreateUserData): UserRow {
    const now   = nowIso()
    const email = data.email?.trim() || null
    db.prepare(`
      INSERT INTO User (id,name,email,emailLower,role,active,passwordHash,mustChangePassword,createdAt,updatedAt)
      VALUES (?,?,?,?,?,1,?,?,?,?)
    `).run(
      data.id, data.name.trim(), email, email?.toLowerCase() ?? null,
      data.role ?? "ENGINEER", data.passwordHash ?? null, data.mustChangePassword ?? 0,
      now, now,
    )
    return this.findUnique(data.id)!
  },

  update(id: string, data: UpdateUserData): UserRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    if (data.name !== undefined) { fields.push('"name" = ?'); params.push(data.name.trim()) }
    if (data.email !== undefined) {
      const email = data.email?.trim() || null
      fields.push('"email" = ?', '"emailLower" = ?')
      params.push(email, email?.toLowerCase() ?? null)
    }
    if (data.role               !== undefined) { fields.push('"role" = ?');               params.push(data.role) }
    if (data.active             !== undefined) { fields.push('"active" = ?');             params.push(data.active) }
    if (data.passwordHash       !== undefined) { fields.push('"passwordHash" = ?');       params.push(data.passwordHash) }
    if (data.mustChangePassword !== undefined) { fields.push('"mustChangePassword" = ?'); params.push(data.mustChangePassword) }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.prepare(`UPDATE User SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return this.findUnique(id)
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM User WHERE id = ?").run(id).changes > 0
  },
}

/** Wipes all jobs, clients, quotes, billing data, and sequences. Preserves users. */
export function resetAllData(): { jobCount: number; clientCount: number; quoteCount: number } {
  return db.transaction(() => {
    const jobCount    = (db.prepare("SELECT COUNT(*) as n FROM Job").get()    as { n: number }).n
    const clientCount = (db.prepare("SELECT COUNT(*) as n FROM Client").get() as { n: number }).n
    const quoteCount  = (db.prepare("SELECT COUNT(*) as n FROM Quote").get()  as { n: number }).n

    db.prepare("DELETE FROM CalendarAssignment").run()
    db.prepare("DELETE FROM CalendarEvent").run()
    db.prepare("DELETE FROM BillingExportSnapshot").run()
    db.prepare("DELETE FROM BillingExportBatch").run()
    db.prepare("DELETE FROM BillingHandoff").run()
    db.prepare("DELETE FROM StatusHistory").run()
    db.prepare("DELETE FROM TypeOfWorksMigrationLog").run()
    db.prepare("DELETE FROM QuoteLineItem").run()
    db.prepare("DELETE FROM Quote").run()
    db.prepare("DELETE FROM InvoiceItem").run()
    db.prepare("DELETE FROM Invoice").run()
    db.prepare("DELETE FROM InvoiceSequence").run()
    db.prepare("DELETE FROM ExportBatchItem").run()
    db.prepare("DELETE FROM ExportBatch").run()
    db.prepare("DELETE FROM Job").run()
    db.prepare("DELETE FROM DrawingSequence").run()
    db.prepare("DELETE FROM RefSequence").run()
    db.prepare("DELETE FROM ClientHold").run()
    db.prepare("DELETE FROM Client").run()

    return { jobCount, clientCount, quoteCount }
  })()
}

// ── Backup system ────────────────────────────────────────────────

export type {
  BackupStatus,
  BackupTrigger,
  BackupJobRow,
  CreateBackupJobData,
  BackupAuditLogRow,
  CreateBackupAuditLogData,
} from "./backup-types"
import type { CreateBackupAuditLogData, CreateBackupJobData, BackupAuditLogRow, BackupJobRow } from "./backup-types"

export const backupJobDb = {
  create(data: CreateBackupJobData): BackupJobRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO BackupJob (id, status, trigger, triggeredBy, triggeredByName, folderName, startedAt, retryOfId, createdAt, updatedAt)
      VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.trigger, data.triggeredBy, data.triggeredByName, data.folderName, now, data.retryOfId ?? null, now, now)
    return this.findUnique(data.id)!
  },

  findUnique(id: string): BackupJobRow | null {
    return (db.prepare("SELECT * FROM BackupJob WHERE id = ?").get(id) as BackupJobRow) ?? null
  },

  findMany(opts: { take?: number } = {}): BackupJobRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM BackupJob ORDER BY createdAt DESC ${limit}`).all() as BackupJobRow[]
  },

  /** Most recent COMPLETED backup whose file hasn't been pruned — what
   *  "Download Latest Backup" actually means. */
  findLatestCompleted(): BackupJobRow | null {
    return (db.prepare(
      "SELECT * FROM BackupJob WHERE status = 'COMPLETED' AND fileDeletedAt IS NULL ORDER BY completedAt DESC LIMIT 1"
    ).get() as BackupJobRow) ?? null
  },

  markRunning(id: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET status = 'RUNNING', updatedAt = ? WHERE id = ?").run(now, id)
  },

  markCompleted(id: string, data: { durationMs: number; sizeBytes: number; checksum: string; rowCounts: Record<string, number> }) {
    const now = nowIso()
    db.prepare(`
      UPDATE BackupJob SET status = 'COMPLETED', completedAt = ?, durationMs = ?, sizeBytes = ?, checksum = ?, rowCountsJson = ?, updatedAt = ?
      WHERE id = ?
    `).run(now, data.durationMs, data.sizeBytes, data.checksum, JSON.stringify(data.rowCounts), now, id)
  },

  markFailed(id: string, errorMessage: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET status = 'FAILED', errorMessage = ?, completedAt = ?, updatedAt = ? WHERE id = ?")
      .run(errorMessage, now, now, id)
  },

  markFileDeleted(id: string) {
    const now = nowIso()
    db.prepare("UPDATE BackupJob SET fileDeletedAt = ?, updatedAt = ? WHERE id = ?").run(now, now, id)
  },

  /** Completed backups beyond the retention count, oldest first — what
   *  the retention-cleanup job actually deletes the files for. Never
   *  deletes the BackupJob row itself, only flags fileDeletedAt later. */
  findBeyondRetention(keepCount: number): BackupJobRow[] {
    return db.prepare(`
      SELECT * FROM BackupJob
      WHERE status = 'COMPLETED' AND fileDeletedAt IS NULL
      ORDER BY completedAt DESC
    `).all().slice(keepCount) as BackupJobRow[]
  },
}

export const backupAuditDb = {
  log(data: CreateBackupAuditLogData): BackupAuditLogRow {
    const id = nanoid()
    const createdAt = nowIso()
    db.prepare(`
      INSERT INTO BackupAuditLog (id, action, backupId, userId, userName, detail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.action, data.backupId ?? null, data.userId, data.userName, data.detail ?? null, createdAt)
    return {
      id,
      action: data.action,
      backupId: data.backupId ?? null,
      userId: data.userId,
      userName: data.userName,
      detail: data.detail ?? null,
      createdAt,
    }
  },

  findMany(opts: { take?: number } = {}): BackupAuditLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM BackupAuditLog ORDER BY createdAt DESC ${limit}`).all() as BackupAuditLogRow[]
  },

  findForBackup(backupId: string): BackupAuditLogRow[] {
    return db.prepare("SELECT * FROM BackupAuditLog WHERE backupId = ? ORDER BY createdAt ASC").all(backupId) as BackupAuditLogRow[]
  },
}

// ── Calendar ────────────────────────────────────────────────────────

export type {
  EventCategoryRow,
  CalendarEventRow,
  CalendarEventWithDetails,
  CreateCalendarEventData,
  UpdateCalendarEventData,
} from "./calendar-types"

export const calendarDb = {
  categories(): EventCategoryRow[] {
    return db.prepare("SELECT * FROM EventCategory ORDER BY name ASC").all() as EventCategoryRow[]
  },

  findMany(opts: { from: string; to: string; userId?: string; categoryId?: string; jobId?: string; clientId?: string }): CalendarEventWithDetails[] {
    const clauses = ["e.startDate <= ? AND e.endDate >= ?"]
    const params: unknown[] = [opts.to, opts.from]

    if (opts.categoryId) { clauses.push("e.categoryId = ?"); params.push(opts.categoryId) }
    if (opts.jobId)      { clauses.push("e.jobId = ?");      params.push(opts.jobId) }
    if (opts.clientId)   { clauses.push("e.clientId = ?");   params.push(opts.clientId) }
    if (opts.userId) {
      clauses.push("EXISTS (SELECT 1 FROM CalendarAssignment ca WHERE ca.eventId = e.id AND ca.userId = ?)")
      params.push(opts.userId)
    }

    const rows = db.prepare(`
      SELECT e.*, ec.name as categoryName, ec.color as categoryColor,
             j.drawingNumber as jobDrawingNumber, c.name as clientName,
             u.name as createdByName
      FROM CalendarEvent e
      LEFT JOIN EventCategory ec ON ec.id = e.categoryId
      LEFT JOIN Job j ON j.id = e.jobId
      LEFT JOIN Client c ON c.id = e.clientId
      LEFT JOIN User u ON u.id = e.createdBy
      WHERE ${clauses.join(" AND ")}
      ORDER BY e.startDate ASC, e.title ASC
    `).all(...params) as (CalendarEventRow & { categoryName: string; categoryColor: string; jobDrawingNumber: string | null; clientName: string | null; createdByName: string })[]

    return rows.map(r => ({ ...r, assignees: this.getAssignees(r.id) }))
  },

  findUnique(id: string): CalendarEventWithDetails | null {
    const row = db.prepare(`
      SELECT e.*, ec.name as categoryName, ec.color as categoryColor,
             j.drawingNumber as jobDrawingNumber, c.name as clientName,
             u.name as createdByName
      FROM CalendarEvent e
      LEFT JOIN EventCategory ec ON ec.id = e.categoryId
      LEFT JOIN Job j ON j.id = e.jobId
      LEFT JOIN Client c ON c.id = e.clientId
      LEFT JOIN User u ON u.id = e.createdBy
      WHERE e.id = ?
    `).get(id) as (CalendarEventRow & { categoryName: string; categoryColor: string; jobDrawingNumber: string | null; clientName: string | null; createdByName: string }) | undefined
    if (!row) return null
    return { ...row, assignees: this.getAssignees(id) }
  },

  create(data: CreateCalendarEventData): CalendarEventRow {
    const now = nowIso()
    db.prepare(`
      INSERT INTO CalendarEvent (id, title, description, categoryId, startDate, endDate, allDay, location, priority, status, jobId, clientId, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id, data.title.trim(), data.description?.trim() || null,
      data.categoryId, data.startDate, data.endDate, data.allDay ?? 1,
      data.location?.trim() || null, data.priority ?? "MEDIUM", data.status ?? "SCHEDULED",
      data.jobId ?? null, data.clientId ?? null, data.createdBy, now, now,
    )
    return db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(data.id) as CalendarEventRow
  },

  update(id: string, data: UpdateCalendarEventData): CalendarEventRow | null {
    const existing = db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(id) as CalendarEventRow | undefined
    if (!existing) return null
    const fields: string[] = []
    const params: unknown[] = []
    if (data.title       !== undefined) { fields.push('"title" = ?');       params.push(data.title.trim()) }
    if (data.description !== undefined) { fields.push('"description" = ?'); params.push(data.description?.trim() || null) }
    if (data.categoryId  !== undefined) { fields.push('"categoryId" = ?');  params.push(data.categoryId) }
    if (data.startDate   !== undefined) { fields.push('"startDate" = ?');   params.push(data.startDate) }
    if (data.endDate     !== undefined) { fields.push('"endDate" = ?');     params.push(data.endDate) }
    if (data.allDay      !== undefined) { fields.push('"allDay" = ?');      params.push(data.allDay) }
    if (data.location    !== undefined) { fields.push('"location" = ?');    params.push(data.location?.trim() || null) }
    if (data.priority    !== undefined) { fields.push('"priority" = ?');    params.push(data.priority) }
    if (data.status      !== undefined) { fields.push('"status" = ?');      params.push(data.status) }
    if (data.jobId       !== undefined) { fields.push('"jobId" = ?');       params.push(data.jobId) }
    if (data.clientId    !== undefined) { fields.push('"clientId" = ?');    params.push(data.clientId) }
    if (!fields.length) return existing
    fields.push('"updatedAt" = ?'); params.push(nowIso(), id)
    db.prepare(`UPDATE CalendarEvent SET ${fields.join(", ")} WHERE id = ?`).run(...params)
    return db.prepare("SELECT * FROM CalendarEvent WHERE id = ?").get(id) as CalendarEventRow
  },

  delete(id: string): boolean {
    return db.prepare("DELETE FROM CalendarEvent WHERE id = ?").run(id).changes > 0
  },

  getAssignees(eventId: string): { userId: string; userName: string }[] {
    return db.prepare(`
      SELECT ca.userId, u.name as userName
      FROM CalendarAssignment ca
      JOIN User u ON u.id = ca.userId
      WHERE ca.eventId = ?
      ORDER BY u.name ASC
    `).all(eventId) as { userId: string; userName: string }[]
  },

  setAssignees(eventId: string, userIds: string[]): void {
    db.transaction(() => {
      db.prepare("DELETE FROM CalendarAssignment WHERE eventId = ?").run(eventId)
      const insert = db.prepare("INSERT INTO CalendarAssignment (id, eventId, userId) VALUES (?, ?, ?)")
      for (const uid of userIds) {
        insert.run(nanoid(), eventId, uid)
      }
    })()
  },
}

// ── Identity switch audit log ───────────────────────────────────────

export type { IdentitySwitchAction, IdentitySwitchLogRow, CreateIdentitySwitchLogData } from "./identity-switch-types"
import type { CreateIdentitySwitchLogData, IdentitySwitchLogRow } from "./identity-switch-types"

export const identitySwitchLogDb = {
  log(data: CreateIdentitySwitchLogData): IdentitySwitchLogRow {
    const id = nanoid()
    const createdAt = nowIso()
    db.prepare(`
      INSERT INTO IdentitySwitchLog (id, action, realUserId, realUserName, targetUserId, targetUserName, detail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.action,
      data.realUserId ?? null, data.realUserName ?? null,
      data.targetUserId ?? null, data.targetUserName ?? null,
      data.detail ?? null, createdAt,
    )
    return {
      id,
      action: data.action,
      realUserId: data.realUserId ?? null,
      realUserName: data.realUserName ?? null,
      targetUserId: data.targetUserId ?? null,
      targetUserName: data.targetUserName ?? null,
      detail: data.detail ?? null,
      createdAt,
    }
  },

  findMany(opts: { take?: number } = {}): IdentitySwitchLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(`SELECT * FROM IdentitySwitchLog ORDER BY createdAt DESC ${limit}`).all() as IdentitySwitchLogRow[]
  },

  /** Every impersonation event (started/ended/rejected) involving a given
   *  real user — either as the admin doing the impersonating or as
   *  whoever was switched away from. Used for the Users page's audit view. */
  findForUser(userId: string, opts: { take?: number } = {}): IdentitySwitchLogRow[] {
    const limit = opts.take != null ? `LIMIT ${opts.take}` : ""
    return db.prepare(
      `SELECT * FROM IdentitySwitchLog WHERE realUserId = ? OR targetUserId = ? ORDER BY createdAt DESC ${limit}`
    ).all(userId, userId) as IdentitySwitchLogRow[]
  },
}