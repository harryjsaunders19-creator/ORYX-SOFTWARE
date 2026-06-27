import { createAdminClient } from "@/lib/supabase/admin"
import type { ClientHoldRow } from "@/lib/db/hold-types"
import { toClientHoldRow, toSupabaseClientHoldRow } from "@/lib/supabase/mappers/client-hold"

function table() {
  return createAdminClient().from("client_holds")
}

export const supabaseHoldRepo = {
  async activeHoldForClient(clientId: string): Promise<ClientHoldRow | null> {
    const { data, error } = await table()
      .select("*")
      .eq("client_id", clientId)
      .eq("status", "ACTIVE")
      .order("added_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? toClientHoldRow(data) : null
  },

  async activeHoldReasonsFor(clientIds: string[]): Promise<{ clientId: string; reason: string }[]> {
    if (!clientIds.length) return []
    const { data, error } = await table()
      .select("client_id, reason")
      .eq("status", "ACTIVE")
      .in("client_id", clientIds)
    if (error) throw error
    return (data ?? []).map((r) => ({ clientId: r.client_id, reason: r.reason }))
  },

  async historyForClient(clientId: string): Promise<ClientHoldRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("client_id", clientId)
      .order("added_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toClientHoldRow)
  },

  async allActiveHolds(): Promise<ClientHoldRow[]> {
    const { data, error } = await table()
      .select("*")
      .eq("status", "ACTIVE")
      .order("added_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(toClientHoldRow)
  },

  async activeCount(): Promise<number> {
    const { count, error } = await table()
      .select("client_id", { count: "exact", head: true })
      .eq("status", "ACTIVE")
    if (error) throw error
    return count ?? 0
  },

  async upsert(row: ClientHoldRow): Promise<void> {
    const { error } = await table().upsert(toSupabaseClientHoldRow(row), { onConflict: "id" })
    if (error) throw error
  },
}
