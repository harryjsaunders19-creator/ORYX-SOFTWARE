import { createAdminClient } from "@/lib/supabase/admin"
import type { IdentitySwitchLogRow } from "@/lib/db/identity-switch-types"
import {
  toIdentitySwitchLogRow,
  toSupabaseIdentitySwitchLogRow,
} from "./identity-switch-mapper"

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
    // Use two .eq queries instead of .or with raw ids (avoids filter injection).
    let asReal = table()
      .select("*")
      .eq("real_user_id", userId)
      .order("created_at", { ascending: false })
    let asTarget = table()
      .select("*")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
    if (opts.take != null) {
      asReal = asReal.limit(opts.take)
      asTarget = asTarget.limit(opts.take)
    }
    const [realRes, targetRes] = await Promise.all([asReal, asTarget])
    if (realRes.error) throw realRes.error
    if (targetRes.error) throw targetRes.error

    const byId = new Map<string, IdentitySwitchLogRow>()
    for (const row of [...(realRes.data ?? []), ...(targetRes.data ?? [])]) {
      const mapped = toIdentitySwitchLogRow(row)
      byId.set(mapped.id, mapped)
    }
    const merged = Array.from(byId.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    return opts.take != null ? merged.slice(0, opts.take) : merged
  },

  async upsert(row: IdentitySwitchLogRow): Promise<void> {
    const { error } = await table().upsert(toSupabaseIdentitySwitchLogRow(row), { onConflict: "id" })
    if (error) throw error
  },
}
