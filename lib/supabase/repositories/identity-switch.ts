import { createAdminClient } from "@/lib/supabase/admin"
import type { IdentitySwitchLogRow } from "@/lib/db/identity-switch-types"
import {
  toIdentitySwitchLogRow,
  toSupabaseIdentitySwitchLogRow,
} from "@/lib/supabase/mappers/identity-switch"

function table() {
  return createAdminClient().from("identity_switch_logs")
}

export const supabaseIdentitySwitchRepo = {
  async findMany(opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    let q = table().select("*").order("created_at", { ascending: false })
    if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toIdentitySwitchLogRow)
  },

  async findForUser(userId: string, opts: { take?: number } = {}): Promise<IdentitySwitchLogRow[]> {
    let q = table()
      .select("*")
      .or(`real_user_id.eq.${userId},target_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
    if (opts.take != null) q = q.limit(opts.take)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toIdentitySwitchLogRow)
  },

  async upsert(row: IdentitySwitchLogRow): Promise<void> {
    const { error } = await table().upsert(toSupabaseIdentitySwitchLogRow(row), { onConflict: "id" })
    if (error) throw error
  },
}
