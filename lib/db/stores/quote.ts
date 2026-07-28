/** Quote and QuoteLineItem table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { todayIsoDate, addDaysToIsoDate } from "@/shared/utils"
import { createId as nanoid } from "@paralleldrive/cuid2"
import { sequenceDb } from "./sequence"

export type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
} from "../quote-types"
import type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
} from "../quote-types"

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

  findMany(opts: { search?: string; status?: string; clientId?: string; skip?: number; take?: number; includeArchived?: boolean; onlyArchived?: boolean } = {}): QuoteRow[] {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search) {
      const pat = `%${opts.search}%`
      clauses.push("(quoteNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR description LIKE ? OR typeOfWorks LIKE ? OR customTypeDescription LIKE ?)")
      params.push(pat, pat, pat, pat, pat, pat)
    }
    if (opts.status)   { clauses.push("status = ?");   params.push(opts.status) }
    if (opts.clientId) { clauses.push("clientId = ?"); params.push(opts.clientId) }
    if (opts.onlyArchived)             { clauses.push("archivedAt IS NOT NULL") }
    else if (!opts.includeArchived)    { clauses.push("archivedAt IS NULL") }
    const w      = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    const limit  = opts.take != null ? `LIMIT ${opts.take}` : ""
    const offset = opts.skip != null ? `OFFSET ${opts.skip}` : ""
    return db.prepare(`SELECT * FROM Quote ${w} ORDER BY createdAt DESC ${limit} ${offset}`).all(...params) as QuoteRow[]
  },

  count(opts: { search?: string; status?: string; clientId?: string; includeArchived?: boolean; onlyArchived?: boolean } = {}): number {
    const clauses: string[] = []
    const params: unknown[] = []
    if (opts.search) {
      const pat = `%${opts.search}%`
      clauses.push("(quoteNumber LIKE ? OR clientCompany LIKE ? OR address LIKE ? OR description LIKE ? OR typeOfWorks LIKE ? OR customTypeDescription LIKE ?)")
      params.push(pat, pat, pat, pat, pat, pat)
    }
    if (opts.status)   { clauses.push("status = ?");   params.push(opts.status) }
    if (opts.clientId) { clauses.push("clientId = ?"); params.push(opts.clientId) }
    if (opts.onlyArchived)             { clauses.push("archivedAt IS NOT NULL") }
    else if (!opts.includeArchived)    { clauses.push("archivedAt IS NULL") }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Quote ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): QuoteRow | null {
    return (db.prepare("SELECT * FROM Quote WHERE id = ?").get(id) as QuoteRow) ?? null
  },

  create(data: CreateQuoteData): QuoteRow {
    const id          = data.id ?? nanoid()
    const quoteNumber = data.quoteNumber ?? sequenceDb.nextRefNumber("Q")
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

  archive(id: string, archivedBy: string, archivedAt: string): boolean {
    return db.prepare(
      "UPDATE Quote SET archivedAt = ?, archivedBy = ?, updatedAt = ? WHERE id = ?"
    ).run(archivedAt, archivedBy, archivedAt, id).changes > 0
  },

  restore(id: string, restoredAt: string): boolean {
    return db.prepare(
      "UPDATE Quote SET archivedAt = NULL, archivedBy = NULL, updatedAt = ? WHERE id = ?"
    ).run(restoredAt, id).changes > 0
  },

  findArchived(): QuoteRow[] {
    return db.prepare("SELECT * FROM Quote WHERE archivedAt IS NOT NULL ORDER BY archivedAt DESC").all() as QuoteRow[]
  },

  /** Insert a quote row from an external source (e.g. Supabase) without side-effects.
   *  Uses INSERT OR IGNORE so it is safe to call even when the row already exists. */
  rawInsertOrIgnore(quote: import("@/modules/quotes/types").QuoteRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO Quote
        (id,quoteNumber,clientId,clientCompany,contactName,address,description,
         typeOfWorks,customTypeDescription,quoteValue,quoteDate,expiryDate,status,
         notes,jobId,pdfPath,preparedBy,createdBy,vatRate,archivedAt,archivedBy,
         createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      quote.id,
      quote.quoteNumber,
      quote.clientId ?? null,
      quote.clientCompany,
      quote.contactName ?? null,
      quote.address,
      quote.description,
      quote.typeOfWorks ?? null,
      quote.customTypeDescription ?? null,
      quote.quoteValue,
      quote.quoteDate,
      quote.expiryDate ?? null,
      quote.status,
      quote.notes ?? null,
      quote.jobId ?? null,
      quote.pdfPath ?? null,
      quote.preparedBy ?? null,
      quote.createdBy ?? "System",
      quote.vatRate ?? null,
      quote.archivedAt ?? null,
      quote.archivedBy ?? null,
      quote.createdAt,
      quote.updatedAt,
    )
  },

  countExpiredDeletable(): number {
    return (db.prepare(`
      SELECT COUNT(*) as n FROM Quote
      WHERE status = 'EXPIRED' AND jobId IS NULL AND archivedAt IS NULL
    `).get() as { n: number }).n
  },

  /** Archive EXPIRED quotes that were never converted to a job (soft-delete). */
  deleteExpired(archivedBy = "System"): QuoteRow[] {
    const now = nowIso()
    const candidates = db.prepare(`
      SELECT * FROM Quote
      WHERE status = 'EXPIRED' AND jobId IS NULL AND archivedAt IS NULL
    `).all() as QuoteRow[]

    const archived: QuoteRow[] = []
    for (const q of candidates) {
      if (this.archive(q.id, archivedBy, now)) archived.push(q)
    }
    return archived
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

