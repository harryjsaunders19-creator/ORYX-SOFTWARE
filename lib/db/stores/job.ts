/** Job table access. */
import { db } from "../connection"
import { nowIso, buildWhere, safeOrder, type WhereClause, type FindManyOptions } from "../helpers"
import { todayIsoDate } from "@/shared/utils"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { billingHandoffDb } from "./billing-handoff"
import { quoteDb } from "./quote"
import { resolveHandoffQuoteValue } from "@/modules/billing/resolve-handoff-quote-value"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { parseJobTags, serializeJobTags } from "@/lib/constants"
import {
  displayDeadlineByOriginal,
  overdueOriginalIds,
  tallyDeadlineStats,
  countActiveOriginalJobs,
  countActiveRevisions,
} from "@/modules/jobs/services/deadline-tallies"

export type { JobRow, CreateJobData, UpdateJobData } from "../job-types"
import type { JobRow, CreateJobData, UpdateJobData } from "../job-types"

function normalizeJobRow(row: JobRow | null): JobRow | null {
  if (!row) return null
  return {
    ...row,
    tags: parseJobTags((row as JobRow & { tags?: unknown }).tags),
    billable: row.billable == null ? true : Boolean(row.billable),
  }
}

function normalizeJobRows(rows: JobRow[]): JobRow[] {
  return rows.map(r => normalizeJobRow(r)!)
}

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
    // Revisions only enter Ready for Invoicing when explicitly marked billable.
    if (job.parentJobId && !(job.billable ?? false)) return
    const billingEventType = job.parentJobId ? "REVISION_COMPLETED" : "JOB_COMPLETED"
    const completionDate   = job.dateCompleted ?? nowIso().slice(0, 10)

    // Prefer Job commercial total; fall back to an attached Quote so accounts
    // do not re-type a price that already exists on the linked quote.
    const linked = quoteDb.findByJobIds([job.id]).map(q => ({
      quoteNumber: q.quoteNumber,
      quoteValue: q.quoteValue,
      status: q.status,
      updatedAt: q.updatedAt,
    }))
    const resolved = resolveHandoffQuoteValue(job, linked)

    db.prepare(`
      INSERT OR IGNORE INTO BillingHandoff
        (id, sourceJobId, billingEventType, drawingNumber, itemType, typeOfWorks, customTypeDescription,
         clientCompany, address, designer, quoteValue, quoteReference, completionDate,
         addedToBillingQueueAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(), job.id, billingEventType, job.drawingNumber, job.itemType, job.typeOfWorks, job.customTypeDescription,
      job.clientCompany, job.address, job.designer || null,
      resolved.quoteValue, resolved.quoteReference,
      completionDate, nowIso(), nowIso(), nowIso(),
    )
  },

  findMany(opts: FindManyOptions = {}): JobRow[] {
    const { sql: w, params } = buildWhere(opts.where)
    const order  = opts.orderBy ? safeOrder(opts.orderBy.field, opts.orderBy.dir) : safeOrder("drawingNumber", "asc")
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return normalizeJobRows(db.prepare(`SELECT * FROM Job ${w} ${order} ${limit} ${offset}`).all(...params) as JobRow[])
  },

  count(where: WhereClause = {}): number {
    const { sql: w, params } = buildWhere(where)
    return (db.prepare(`SELECT COUNT(*) as n FROM Job ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): JobRow | null {
    return normalizeJobRow((db.prepare("SELECT * FROM Job WHERE id = ?").get(id) as JobRow) ?? null)
  },

  /** Batched version of findUnique for a list of ids — one query instead of N. Results
   *  are not guaranteed to preserve the input order; callers needing a specific order
   *  (e.g. the billing export, which preserves selection order) should re-sort by id. */
  findManyByIds(ids: string[]): JobRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return normalizeJobRows(db.prepare(`SELECT * FROM Job WHERE id IN (${placeholders})`).all(...ids) as JobRow[])
  },

  revisionsForJob(parentId: string): JobRow[] {
    return normalizeJobRows(db.prepare("SELECT * FROM Job WHERE parentJobId = ? ORDER BY revisionLetter ASC").all(parentId) as JobRow[])
  },

  /** Latest revision row per original job (by max revisionLetter). */
  findLatestRevisionsForParents(parentIds: string[]): JobRow[] {
    if (!parentIds.length) return []
    const placeholders = parentIds.map(() => "?").join(",")
    return normalizeJobRows(db.prepare(`
      SELECT j.* FROM Job j
      INNER JOIN (
        SELECT parentJobId, MAX(revisionLetter) AS maxLetter
        FROM Job
        WHERE parentJobId IN (${placeholders})
        GROUP BY parentJobId
      ) latest ON j.parentJobId = latest.parentJobId AND j.revisionLetter = latest.maxLetter
    `).all(...parentIds) as JobRow[])
  },

  create(data: CreateJobData): JobRow {
    const now = nowIso(); const changedBy = data.changedBy ?? "System"
    const tagsJson = serializeJobTags(data.tags)
    db.transaction(() => {
      db.prepare(`
        INSERT INTO Job (id,drawingNumber,itemType,address,siteName,siteAddress,typeOfWorks,customTypeDescription,clientCompany,clientId,requestedBy,
          status,designer,dateCompleted,notes,designStandards,tags,quoteValue,quoteReference,quoteDate,commercialNotes,
          variationFees,additionalCharges,
          parentJobId,revisionLetter,billable,requestedDate,requiredByDate,dateCreated,createdAt,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(data.id, data.drawingNumber, data.itemType ?? "DESIGN", data.address,
             data.siteName ?? null, data.siteAddress ?? null,
             data.typeOfWorks,
             data.customTypeDescription ?? null,
             data.clientCompany, data.clientId ?? null, data.requestedBy, data.status, data.designer ?? "",
             data.dateCompleted ?? null, data.notes ?? null, data.designStandards ?? null, tagsJson,
             data.quoteValue ?? null, data.quoteReference ?? null,
             data.quoteDate ?? null, data.commercialNotes ?? null,
             data.variationFees ?? null, data.additionalCharges ?? null,
             data.parentJobId ?? null, data.revisionLetter ?? null,
             (data.billable ?? (data.parentJobId ? false : true)) ? 1 : 0,
             data.requestedDate ?? null, data.requiredByDate ?? null,
             now, now, now)
      db.prepare("INSERT INTO StatusHistory (id,jobId,fromStatus,toStatus,changedBy,changedAt) VALUES (?,?,NULL,?,?,?)")
        .run(nanoid(), data.id, data.status, changedBy, now)
      this._recordBillingHandoffIfIssued(this.findUnique(data.id)!)
    })()
    return this.findUnique(data.id)!
  },

  setDrawingNumber(id: string, drawingNumber: string): void {
    db.prepare("UPDATE Job SET drawingNumber = ?, updatedAt = ? WHERE id = ?")
      .run(drawingNumber, nowIso(), id)
  },

  update(id: string, data: UpdateJobData): JobRow | null {
    const existing = this.findUnique(id)
    if (!existing) return null
    const changedBy = data.changedBy ?? "System"
    const statusChanged = data.status !== undefined && data.status !== existing.status
    const oldStatus = existing.status
    // Stamp completion when moving to ISSUED so performance period KPIs work.
    const patch: UpdateJobData = { ...data }
    if (
      statusChanged
      && data.status === "ISSUED"
      && data.dateCompleted === undefined
      && !existing.dateCompleted
    ) {
      patch.dateCompleted = nowIso().slice(0, 10)
    }
    const allowedColumns = new Set([
      "address", "siteName", "siteAddress", "typeOfWorks", "customTypeDescription", "clientCompany", "clientId",
      "requestedBy", "status", "designer", "dateCompleted", "notes", "designStandards", "tags", "quoteValue",
      "quoteReference", "quoteDate", "commercialNotes", "variationFees", "additionalCharges",
      "requestedDate", "requiredByDate", "billable", "parentJobId", "revisionLetter", "itemType",
    ])
    const fields: string[] = []; const params: unknown[] = []
    for (const [key, val] of Object.entries(patch)) {
      if (key === "changedBy" || val === undefined) continue
      if (!allowedColumns.has(key)) continue
      fields.push(`"${key}" = ?`)
      if (key === "billable") params.push(val ? 1 : 0)
      else if (key === "tags") params.push(serializeJobTags(val as string[]))
      else params.push(val)
    }
    const siteName = patch.siteName !== undefined ? (patch.siteName?.trim() ?? null) : existing.siteName
    const siteAddress = patch.siteAddress !== undefined ? (patch.siteAddress?.trim() ?? null) : existing.siteAddress
    const nextAddress = patch.address !== undefined
      ? patch.address
      : (patch.siteName !== undefined || patch.siteAddress !== undefined)
        ? composeJobAddress(siteName, siteAddress, existing.address)
        : existing.address
    if (patch.siteName !== undefined || patch.siteAddress !== undefined) {
      const hasAddressField = fields.some(f => f.startsWith('"address"'))
      if (!hasAddressField) {
        fields.push('"address" = ?')
        params.push(nextAddress)
      }
    }
    const locationChanged = (
      (patch.address !== undefined && patch.address.trim().toLowerCase() !== existing.address.trim().toLowerCase())
      || (patch.siteName !== undefined && (patch.siteName?.trim() ?? "") !== (existing.siteName?.trim() ?? ""))
      || (patch.siteAddress !== undefined && (patch.siteAddress?.trim() ?? "") !== (existing.siteAddress?.trim() ?? ""))
    )
    if (locationChanged) {
      fields.push(
        '"latitude" = ?', '"longitude" = ?', '"geocodedAt" = ?', '"geocodedAddress" = ?',
        '"locationStatus" = ?', '"locationSource" = ?',
      )
      params.push(null, null, null, null, "needs_review", null)
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
  rawInsertOrIgnore(job: import("@/modules/jobs/types/job-types").JobRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO Job
        (id,drawingNumber,itemType,address,typeOfWorks,customTypeDescription,clientCompany,clientId,requestedBy,
         status,designer,dateCompleted,notes,designStandards,tags,quoteValue,quoteReference,quoteDate,commercialNotes,
         variationFees,additionalCharges,parentJobId,revisionLetter,requestedDate,requiredByDate,
         dateCreated,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      job.id, job.drawingNumber, job.itemType, job.address, job.typeOfWorks,
      job.customTypeDescription ?? null, job.clientCompany, job.clientId ?? null, job.requestedBy,
      job.status, job.designer ?? "", job.dateCompleted ?? null, job.notes ?? null, job.designStandards ?? null,
      serializeJobTags(job.tags),
      job.quoteValue ?? null, job.quoteReference ?? null, job.quoteDate ?? null,
      job.commercialNotes ?? null, job.variationFees ?? null, job.additionalCharges ?? null,
      job.parentJobId ?? null, job.revisionLetter ?? null,
      job.requestedDate ?? null, job.requiredByDate ?? null,
      job.dateCreated, job.createdAt, job.updatedAt,
    )
  },

  groupByItemType(): { itemType: string; count: number }[] {
    return db.prepare("SELECT itemType, COUNT(*) as count FROM Job WHERE archivedAt IS NULL GROUP BY itemType").all() as { itemType: string; count: number }[]
  },

  deadlineStats(): { overdueCount: number; dueTodayCount: number; dueThisWeekCount: number } {
    const rows = db.prepare(
      "SELECT id, parentJobId, revisionLetter, status, requiredByDate FROM Job WHERE archivedAt IS NULL",
    ).all() as {
      id: string
      parentJobId: string | null
      revisionLetter: string | null
      status: string
      requiredByDate: string | null
    }[]
    return tallyDeadlineStats(rows, todayIsoDate())
  },

  /** Originals whose current-revision status is New Request / In Progress. */
  countActiveOriginals(): number {
    const rows = db.prepare(
      "SELECT id, parentJobId, revisionLetter, status, requiredByDate FROM Job WHERE archivedAt IS NULL",
    ).all() as {
      id: string
      parentJobId: string | null
      revisionLetter: string | null
      status: string
      requiredByDate: string | null
    }[]
    return countActiveOriginalJobs(rows)
  },

  /** Revisions that are not sent (Ready to Send) or Complete. */
  countActiveRevisions(): number {
    const rows = db.prepare(
      "SELECT id, parentJobId, revisionLetter, status, requiredByDate FROM Job WHERE archivedAt IS NULL",
    ).all() as {
      id: string
      parentJobId: string | null
      revisionLetter: string | null
      status: string
      requiredByDate: string | null
    }[]
    return countActiveRevisions(rows)
  },

  /** Overdue originals for dashboard alert — current-revision deadline semantics. */
  overdueJobs(): JobRow[] {
    const slim = db.prepare(
      "SELECT id, parentJobId, revisionLetter, status, requiredByDate FROM Job WHERE archivedAt IS NULL",
    ).all() as {
      id: string
      parentJobId: string | null
      revisionLetter: string | null
      status: string
      requiredByDate: string | null
    }[]
    const ids = overdueOriginalIds(slim, todayIsoDate())
    if (ids.length === 0) return []
    const display = displayDeadlineByOriginal(slim)
    const placeholders = ids.map(() => "?").join(",")
    const jobs = normalizeJobRows(db.prepare(
      `SELECT * FROM Job WHERE id IN (${placeholders})`,
    ).all(...ids) as JobRow[])
    return jobs
      .map(j => {
        const overlay = display.get(j.id)
        if (!overlay) return j
        return { ...j, status: overlay.status, requiredByDate: overlay.requiredByDate }
      })
      .sort((a, b) => (a.requiredByDate ?? "").localeCompare(b.requiredByDate ?? ""))
      .slice(0, 20)
  },

  groupByStatus(): { status: string; count: number }[] {
    return db.prepare("SELECT status, COUNT(*) as count FROM Job WHERE archivedAt IS NULL GROUP BY status").all() as { status: string; count: number }[]
  },

  /** Distinct designer names from active (non-archived) jobs. */
  distinctDesigners(): string[] {
    const rows = db.prepare(
      "SELECT DISTINCT designer FROM Job WHERE archivedAt IS NULL AND designer IS NOT NULL AND designer != '' ORDER BY designer COLLATE NOCASE ASC"
    ).all() as { designer: string }[]
    return rows.map(r => r.designer)
  },

  countWhere(where: WhereClause & { createdAfter?: string }): number {
    const clauses: string[] = ["archivedAt IS NULL"]; const params: unknown[] = []
    if (where.status)        { clauses.push("status = ?");                        params.push(where.status) }
    if (where.createdAfter)  { clauses.push("createdAt >= ?");                    params.push(where.createdAfter) }
    if (where.unassigned)    { clauses.push("(designer = '' OR designer IS NULL)") }
    if (where.onlyOriginals) { clauses.push("parentJobId IS NULL") }
    if (where.onlyRevisions) { clauses.push("parentJobId IS NOT NULL") }
    if (where.notInvoiced)   { clauses.push("invoiceId IS NULL") }
    if (where.invoiced)      { clauses.push("invoiceId IS NOT NULL") }
    if (where.overdue)       { clauses.push("requiredByDate IS NOT NULL AND requiredByDate < date('now') AND status != 'ISSUED'") }
    if (where.dueToday)      { clauses.push("requiredByDate IS NOT NULL AND requiredByDate = date('now') AND status != 'ISSUED'") }
    if (where.dueThisWeek)   { clauses.push("requiredByDate IS NOT NULL AND requiredByDate >= date('now') AND requiredByDate <= date('now','+7 days') AND status != 'ISSUED'") }
    const sql = `SELECT COUNT(*) as n FROM Job WHERE ${clauses.join(" AND ")}`
    return (db.prepare(sql).get(...params) as { n: number }).n
  },

  findRecent(take: number) {
    return db.prepare(
      `SELECT id,drawingNumber,itemType,address,status,clientCompany,designer,quoteValue,invoiceId,parentJobId,revisionLetter,dateCreated,createdAt
       FROM Job WHERE archivedAt IS NULL ORDER BY dateCreated DESC LIMIT ?`
    ).all(take) as Pick<JobRow, "id"|"drawingNumber"|"itemType"|"address"|"status"|"clientCompany"|"designer"|"quoteValue"|"invoiceId"|"parentJobId"|"revisionLetter"|"createdAt">[]
  },

  /** All ISSUED, non-archived jobs not yet invoiced — the invoice queue */
  invoiceQueue(): JobRow[] {
    return db.prepare(
      "SELECT * FROM Job WHERE archivedAt IS NULL AND status = 'ISSUED' AND (invoiceId IS NULL) ORDER BY clientCompany ASC, createdAt ASC"
    ).all() as JobRow[]
  },

  /** Billing queue: ISSUED, not invoiced, not already exported, not archived */
  billingQueue(): JobRow[] {
    return db.prepare(
      `SELECT * FROM Job
       WHERE archivedAt IS NULL
         AND status = 'ISSUED'
         AND (invoiceId IS NULL)
         AND (billingStatus IS NULL OR billingStatus != 'EXPORTED_TO_ACCOUNTS')
       ORDER BY clientCompany ASC, createdAt ASC`
    ).all() as JobRow[]
  },

  archive(id: string, archivedBy: string, archivedAt: string): boolean {
    return db.prepare(
      "UPDATE Job SET archivedAt = ?, archivedBy = ?, updatedAt = ? WHERE id = ?"
    ).run(archivedAt, archivedBy, archivedAt, id).changes > 0
  },

  restore(id: string, restoredAt: string): boolean {
    return db.prepare(
      "UPDATE Job SET archivedAt = NULL, archivedBy = NULL, updatedAt = ? WHERE id = ?"
    ).run(restoredAt, id).changes > 0
  },

  findArchived(): JobRow[] {
    return db.prepare("SELECT * FROM Job WHERE archivedAt IS NOT NULL ORDER BY archivedAt DESC").all() as JobRow[]
  },

  findNeedingGeocode(limit: number): Pick<JobRow, "id" | "address" | "siteName" | "siteAddress" | "locationStatus">[] {
    return db.prepare(`
      SELECT id, address, siteName, siteAddress, locationStatus FROM Job
      WHERE status = 'ISSUED'
        AND archivedAt IS NULL
        AND parentJobId IS NULL
        AND (latitude IS NULL OR longitude IS NULL)
        AND (locationStatus IS NULL OR locationStatus = 'needs_review')
      ORDER BY dateCreated DESC
      LIMIT ?
    `).all(limit) as Pick<JobRow, "id" | "address" | "siteName" | "siteAddress" | "locationStatus">[]
  },

  findMissingLocations(): Array<{
    id: string
    drawingNumber: string
    siteName: string | null
    siteAddress: string | null
    address: string
    clientCompany: string
    dateCompleted: string | null
    locationStatus: string | null
  }> {
    return db.prepare(`
      SELECT
        id, drawingNumber, siteName, siteAddress, address, clientCompany,
        dateCompleted, locationStatus
      FROM Job
      WHERE status = 'ISSUED'
        AND archivedAt IS NULL
        AND parentJobId IS NULL
        AND (
          latitude IS NULL OR longitude IS NULL OR locationStatus = 'needs_review'
        )
      ORDER BY dateCompleted DESC, dateCreated DESC
    `).all() as Array<{
      id: string
      drawingNumber: string
      siteName: string | null
      siteAddress: string | null
      address: string
      clientCompany: string
      dateCompleted: string | null
      locationStatus: string | null
    }>
  },

  countMissingLocations(): number {
    return (db.prepare(`
      SELECT COUNT(*) as n FROM Job
      WHERE status = 'ISSUED'
        AND archivedAt IS NULL
        AND parentJobId IS NULL
        AND (
          latitude IS NULL OR longitude IS NULL OR locationStatus = 'needs_review'
        )
    `).get() as { n: number }).n
  },

  countNeedingGeocode(): number {
    return (db.prepare(`
      SELECT COUNT(*) as n FROM Job
      WHERE status = 'ISSUED'
        AND archivedAt IS NULL
        AND parentJobId IS NULL
        AND (latitude IS NULL OR longitude IS NULL)
        AND (locationStatus IS NULL OR locationStatus = 'needs_review')
    `).get() as { n: number }).n
  },

  findCompletedForMap(): JobRow[] {
    return db.prepare(`
      SELECT * FROM Job
      WHERE status = 'ISSUED' AND archivedAt IS NULL
      ORDER BY dateCreated DESC
    `).all() as JobRow[]
  },

  /** Slim query — completed jobs that already have coordinates (map display only). */
  findMappedForMap(bbox?: {
    south: number
    west: number
    north: number
    east: number
  }): import("@/modules/job-map/types/map-row").JobMapRow[] {
    if (!bbox) {
      return db.prepare(`
        SELECT
          id, drawingNumber, address, siteName, siteAddress, latitude, longitude, status,
          clientCompany, typeOfWorks, customTypeDescription, designer, dateCreated,
          locationStatus, locationSource
        FROM Job
        WHERE status = 'ISSUED'
          AND archivedAt IS NULL
          AND parentJobId IS NULL
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (locationStatus IS NULL OR locationStatus IN ('mapped', 'manual'))
        ORDER BY dateCreated DESC
        LIMIT 3000
      `).all() as import("@/modules/job-map/types/map-row").JobMapRow[]
    }

    return db.prepare(`
      SELECT
        id, drawingNumber, address, siteName, siteAddress, latitude, longitude, status,
        clientCompany, typeOfWorks, customTypeDescription, designer, dateCreated,
        locationStatus, locationSource
      FROM Job
      WHERE status = 'ISSUED'
        AND archivedAt IS NULL
        AND parentJobId IS NULL
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND (locationStatus IS NULL OR locationStatus IN ('mapped', 'manual'))
        AND latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
      ORDER BY dateCreated DESC
      LIMIT 3000
    `).all(bbox.south, bbox.north, bbox.west, bbox.east) as import("@/modules/job-map/types/map-row").JobMapRow[]
  },

  countCompletedMissingCoordinates(): number {
    return this.countMissingLocations()
  },

  saveLocation(
    id: string,
    latitude: number,
    longitude: number,
    locationStatus: string,
    locationSource: string,
    geocodedAddress: string | null = null,
  ): JobRow | null {
    const now = nowIso()
    db.prepare(`
      UPDATE Job SET
        latitude = ?, longitude = ?, geocodedAt = ?, geocodedAddress = ?,
        locationStatus = ?, locationSource = ?, updatedAt = ?
      WHERE id = ?
    `).run(latitude, longitude, now, geocodedAddress, locationStatus, locationSource, now, id)
    return this.findUnique(id)
  },

  markLocationNeedsReview(id: string): JobRow | null {
    const now = nowIso()
    db.prepare(`
      UPDATE Job SET
        latitude = NULL, longitude = NULL, geocodedAt = NULL, geocodedAddress = NULL,
        locationStatus = 'needs_review', locationSource = NULL, updatedAt = ?
      WHERE id = ?
    `).run(now, id)
    return this.findUnique(id)
  },

  saveGeocode(id: string, latitude: number, longitude: number, geocodedAddress: string): JobRow | null {
    return this.saveLocation(id, latitude, longitude, "mapped", "geocoded", geocodedAddress)
  },
}

