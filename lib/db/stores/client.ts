/** Client table access. */
import { db, DB_EXISTED } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"
import type { JobRow } from "../job-types"

export type { ClientRow, CreateClientData, UpdateClientData } from "../client-types"
import type { ClientRow, CreateClientData, UpdateClientData } from "../client-types"

export const clientDb = {
  findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): ClientRow[] {
    const clauses: string[] = []
    const params:  unknown[] = []
    if (opts.search) {
      clauses.push("(nameLower LIKE ? OR contactName LIKE ? OR email LIKE ? OR phone LIKE ? OR accountCode LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s, s, s)
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
      clauses.push("(c.nameLower LIKE ? OR c.contactName LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.accountCode LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s, s, s)
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
      clauses.push("(nameLower LIKE ? OR contactName LIKE ? OR email LIKE ? OR phone LIKE ? OR accountCode LIKE ?)")
      const s = `%${opts.search.toLowerCase()}%`
      params.push(s, s, s, s, s)
    }
    if (opts.activeOnly) { clauses.push("active = 1") }
    const w = clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
    return (db.prepare(`SELECT COUNT(*) as n FROM Client ${w}`).get(...params) as { n: number }).n
  },

  findUnique(id: string): ClientRow | null {
    return (db.prepare("SELECT * FROM Client WHERE id = ?").get(id) as ClientRow) ?? null
  },

  findManyByIds(ids: string[]): ClientRow[] {
    if (!ids.length) return []
    const placeholders = ids.map(() => "?").join(",")
    return db.prepare(`SELECT * FROM Client WHERE id IN (${placeholders})`).all(...ids) as ClientRow[]
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
    const simple: (keyof UpdateClientData)[] = ["contactName","email","phone","billingAddress","notes","accountCode","active","archivedAt","archivedBy"]
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

  /** Insert a client row from an external source (e.g. Supabase) without side-effects.
   *  Uses INSERT OR IGNORE so it is safe to call even when the row already exists. */
  rawInsertOrIgnore(client: import("@/lib/db/client-types").ClientRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO Client
        (id,name,nameLower,contactName,email,phone,billingAddress,notes,accountCode,active,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      client.id,
      client.name,
      client.name.toLowerCase(),
      client.contactName ?? null,
      client.email ?? null,
      client.phone ?? null,
      client.billingAddress ?? null,
      client.notes ?? null,
      client.accountCode ?? null,
      client.active ?? 1,
      client.createdAt,
      client.updatedAt,
    )
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
