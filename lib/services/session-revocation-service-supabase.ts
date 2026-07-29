/**
 * Session revocation — Supabase-only path (Vercel / isSupabaseOnly).
 */
import { supabaseSessionRevocationRepo } from "@/lib/supabase/repositories/session-revocation"

type TokenSig = string

export const sessionRevocationService = {
  async isTokenRevoked(tokenSig: TokenSig): Promise<boolean> {
    try {
      return await supabaseSessionRevocationRepo.isRevoked(tokenSig)
    } catch (err) {
      console.warn("[auth.sessionRevocation] lookup failed; failing open.", err)
      return false
    }
  },

  async revokeToken(tokenSig: TokenSig, expiresAt: string): Promise<void> {
    try {
      await supabaseSessionRevocationRepo.revoke(tokenSig, expiresAt)
    } catch (err) {
      console.warn("[auth.sessionRevocation] revoke failed; continuing.", err)
    }
  },

  async pruneExpired(): Promise<void> {
    try {
      await supabaseSessionRevocationRepo.pruneExpired()
    } catch (err) {
      console.warn("[auth.sessionRevocation] prune failed; continuing.", err)
    }
  },
}
