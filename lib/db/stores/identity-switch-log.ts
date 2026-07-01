/** IdentitySwitchLog audit table access. */
import { db } from "../connection"
import { nowIso } from "../helpers"
import { createId as nanoid } from "@paralleldrive/cuid2"

export type { IdentitySwitchAction, IdentitySwitchLogRow, CreateIdentitySwitchLogData } from "../identity-switch-types"
import type { CreateIdentitySwitchLogData, IdentitySwitchLogRow } from "../identity-switch-types"

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
