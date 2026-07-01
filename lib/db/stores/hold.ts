/** ClientHold table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type { ClientHoldRow, ClientHoldWithClientRow } from "../hold-types"
import type { ClientHoldRow, ClientHoldWithClientRow } from "../hold-types"

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

  /** Insert a hold row from an external source (e.g. Supabase) without side-effects. */
  rawInsertOrIgnore(hold: import("@/lib/db/hold-types").ClientHoldRow): void {
    db.prepare(`
      INSERT OR IGNORE INTO ClientHold
        (id,clientId,status,reason,notes,addedBy,addedAt,removedBy,removedAt,removedReason)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      hold.id, hold.clientId, hold.status, hold.reason,
      hold.notes ?? null, hold.addedBy, hold.addedAt,
      hold.removedBy ?? null, hold.removedAt ?? null, hold.removedReason ?? null,
    )
  },

  /** Upsert a hold row from an external source (e.g. Supabase mirror). */
  rawUpsert(hold: import("@/lib/db/hold-types").ClientHoldRow): void {
    db.prepare(`
      INSERT OR REPLACE INTO ClientHold
        (id,clientId,status,reason,notes,addedBy,addedAt,removedBy,removedAt,removedReason)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      hold.id, hold.clientId, hold.status, hold.reason,
      hold.notes ?? null, hold.addedBy, hold.addedAt,
      hold.removedBy ?? null, hold.removedAt ?? null, hold.removedReason ?? null,
    )
  },
}
