import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { sessionRevocationDb } from "@/lib/db/stores/session-revocation"
import { supabaseSessionRevocationRepo } from "@/lib/supabase/repositories/session-revocation"

type TokenSig = string

function store() {
  return isSupabaseOnly() ? supabaseSessionRevocationRepo : sessionRevocationDb
}

export const sessionRevocationService = {
  async isTokenRevoked(tokenSig: TokenSig): Promise<boolean> {
    // SQLite store is sync; Supabase store is async — normalize to async.
    try {
      return await store().isRevoked(tokenSig)
    } catch (err) {
      // If the revocation table isn't present yet (migration not applied),
      // keep the app usable rather than hard-failing authentication.
      console.warn("[auth.sessionRevocation] lookup failed; failing open.", err)
      return false
    }
  },

  async revokeToken(tokenSig: TokenSig, expiresAt: string): Promise<void> {
    try {
      await store().revoke(tokenSig, expiresAt)
    } catch (err) {
      console.warn("[auth.sessionRevocation] revoke failed; continuing.", err)
    }
  },

  async pruneExpired(): Promise<void> {
    try {
      await store().pruneExpired()
    } catch (err) {
      console.warn("[auth.sessionRevocation] prune failed; continuing.", err)
    }
  },
}

