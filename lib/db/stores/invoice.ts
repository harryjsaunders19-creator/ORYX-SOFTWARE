/** Legacy Invoice table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"
import type { JobRow } from "../job-types"

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
