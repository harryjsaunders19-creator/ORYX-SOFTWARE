import { createAdminClient } from "@/shared/supabase/admin"
import { nowIso } from "@/lib/db/helpers"

type TokenSig = string

const table = () => createAdminClient().from("session_revocations")

export const supabaseSessionRevocationRepo = {
  async isRevoked(tokenSig: TokenSig, now: string = nowIso()): Promise<boolean> {
    const { data, error } = await table()
      .select("token_sig")
      .eq("token_sig", tokenSig)
      .gt("expires_at", now)
      .maybeSingle()

    if (error) throw error
    return !!data
  },

  async revoke(tokenSig: TokenSig, expiresAt: string): Promise<void> {
    const { error } = await table().upsert(
      {
        token_sig: tokenSig,
        revoked_at: nowIso(),
        expires_at: expiresAt,
      },
      { onConflict: "token_sig" },
    )
    if (error) throw error
  },

  async pruneExpired(now: string = nowIso()): Promise<void> {
    const { error } = await table().delete().lte("expires_at", now)
    if (error) throw error
  },
}

