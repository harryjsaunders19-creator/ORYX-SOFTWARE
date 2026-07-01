/** Legacy ExportBatch table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { jobDb } from "./job"
import type { JobRow } from "../job-types"

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
