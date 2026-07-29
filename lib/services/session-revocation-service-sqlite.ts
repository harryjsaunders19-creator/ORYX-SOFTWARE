/**
 * Session revocation — SQLite path for local/CI.
 */
import { sessionRevocationDb } from "@/lib/db/stores/session-revocation"

type TokenSig = string

export const sessionRevocationService = {
  async isTokenRevoked(tokenSig: TokenSig): Promise<boolean> {
    try {
      return await sessionRevocationDb.isRevoked(tokenSig)
    } catch (err) {
      console.warn("[auth.sessionRevocation] lookup failed; failing open.", err)
      return false
    }
  },

  async revokeToken(tokenSig: TokenSig, expiresAt: string): Promise<void> {
    try {
      await sessionRevocationDb.revoke(tokenSig, expiresAt)
    } catch (err) {
      console.warn("[auth.sessionRevocation] revoke failed; continuing.", err)
    }
  },

  async pruneExpired(): Promise<void> {
    try {
      await sessionRevocationDb.pruneExpired()
    } catch (err) {
      console.warn("[auth.sessionRevocation] prune failed; continuing.", err)
    }
  },
}
