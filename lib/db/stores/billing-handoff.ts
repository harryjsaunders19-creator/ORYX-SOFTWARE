/** BillingHandoff (Ready For Invoicing queue) table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { totalJobCommercialValue } from "@/shared/utils"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"
import { clientDb } from "./client"
import { historyDb } from "./history"
import { sequenceDb } from "./sequence"
import { quoteDb } from "./quote"

export type { BillingHandoffRow, BillingExportBatchRow, BillingExportSnapshotRow } from "../billing-types"
import type { BillingHandoffRow, BillingExportBatchRow } from "../billing-types"

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

export const billingHandoffDb = {
  findMany(opts: { cleared?: boolean; search?: string; skip?: number; take?: number } = {}): BillingHandoffRow[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.cleared === true)  clauses.push("clearedByAccountsAt IS NOT NULL")
    if (opts.cleared === false) clauses.push("clearedByAccountsAt IS NULL")
    if (opts.search) {
      const s = `%${opts.search}%`
      clauses.push("(drawingNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR quoteReference LIKE ? OR designer LIKE ?)")
      params.push(s, s, s, s, s)
    }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    // Awaiting items are FIFO (oldest-added first, so accounts works through
    // a backlog in order); cleared items are most-recently-cleared first.
    const order  = opts.cleared === true ? "ORDER BY clearedByAccountsAt DESC" : "ORDER BY addedToBillingQueueAt ASC"
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM BillingHandoff ${w} ${order} ${limit} ${offset}`).all(...params) as BillingHandoffRow[]
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

  /** Insert a billing handoff row from an external source (e.g. Supabase) without side-effects. */
  rawInsertOrIgnore(row: BillingHandoffRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO BillingHandoff
        (id,sourceJobId,billingEventType,drawingNumber,itemType,typeOfWorks,customTypeDescription,
         clientCompany,address,designer,quoteValue,quoteReference,completionDate,
         addedToBillingQueueAt,clearedByAccountsAt,clearedBy,exportBatchId,notes,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      row.id, row.sourceJobId, row.billingEventType,
      row.drawingNumber, row.itemType, row.typeOfWorks ?? null, row.customTypeDescription ?? null,
      row.clientCompany, row.address, row.designer ?? null,
      row.quoteValue ?? null, row.quoteReference ?? null, row.completionDate,
      row.addedToBillingQueueAt, row.clearedByAccountsAt ?? null, row.clearedBy ?? null,
      row.exportBatchId ?? null, row.notes ?? null, row.createdAt, row.updatedAt,
    )
  },

  /** Overwrite local row with Supabase state before export (Vercel ephemeral SQLite). */
  syncFromRemote(row: BillingHandoffRow): void {
    const existing = this.findUnique(row.id)
    if (!existing) {
      this.rawInsertOrIgnore(row)
      return
    }
    db.prepare(`
      UPDATE BillingHandoff SET
        sourceJobId = ?, billingEventType = ?, drawingNumber = ?, itemType = ?,
        typeOfWorks = ?, customTypeDescription = ?, clientCompany = ?, address = ?,
        designer = ?, quoteValue = ?, quoteReference = ?, completionDate = ?,
        addedToBillingQueueAt = ?, clearedByAccountsAt = ?, clearedBy = ?,
        exportBatchId = ?, notes = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      row.sourceJobId, row.billingEventType, row.drawingNumber, row.itemType,
      row.typeOfWorks ?? null, row.customTypeDescription ?? null,
      row.clientCompany, row.address, row.designer ?? null,
      row.quoteValue ?? null, row.quoteReference ?? null, row.completionDate,
      row.addedToBillingQueueAt, row.clearedByAccountsAt ?? null, row.clearedBy ?? null,
      row.exportBatchId ?? null, row.notes ?? null, row.updatedAt, row.id,
    )
  },
};
