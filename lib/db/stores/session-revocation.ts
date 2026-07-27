/** SessionRevocation: invalidates specific signed session cookies early.
 *
 * M3: "stolen cookie valid until TTL" — we keep a signed token signature
 * revocation list with the token's original expiry so verification can fail
 * immediately even before `exp`.
 */
import { db } from "../connection"
import { nowIso } from "../helpers"

export type SessionRevocationRow = {
  tokenSig: string
  revokedAt: string
  expiresAt: string
}

export const sessionRevocationDb = {
  isRevoked(tokenSig: string, now: string = nowIso()): boolean {
    // ISO-8601 strings compare correctly lexicographically.
    const row = db
      .prepare(
        `SELECT 1 as ok
         FROM SessionRevocation
         WHERE tokenSig = ? AND expiresAt > ?
         LIMIT 1`,
      )
      .get(tokenSig, now) as { ok: 1 } | undefined
    return !!row
  },

  revoke(tokenSig: string, expiresAt: string): void {
    const revokedAt = nowIso()
    db.prepare(
      `INSERT INTO SessionRevocation (tokenSig, revokedAt, expiresAt)
       VALUES (?, ?, ?)
       ON CONFLICT(tokenSig) DO UPDATE SET revokedAt = excluded.revokedAt, expiresAt = excluded.expiresAt`,
    ).run(tokenSig, revokedAt, expiresAt)
  },

  /** Best-effort cleanup for long-running local dev. */
  pruneExpired(now: string = nowIso()): void {
    db.prepare(`DELETE FROM SessionRevocation WHERE expiresAt <= ?`).run(now)
  },
}

