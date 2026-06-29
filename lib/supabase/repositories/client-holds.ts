import { createAdminClient } from "@/lib/supabase/admin"
import { createId } from "@paralleldrive/cuid2"
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

  async createHold(data: {
    clientId: string
    reason: string
    notes: string | null
    addedBy: string
    addedAt: string
  }): Promise<ClientHoldRow> {
    const row: ClientHoldRow = {
      id: createId(),
      clientId: data.clientId,
      status: "ACTIVE",
      reason: data.reason,
      notes: data.notes,
      addedBy: data.addedBy,
      addedAt: data.addedAt,
      removedBy: null,
      removedAt: null,
      removedReason: null,
    }
    const { error } = await table().insert(toSupabaseClientHoldRow(row))
    if (error) throw error
    return row
  },

  async updateActiveHold(
    id: string,
    data: { reason: string; notes: string | null; addedBy: string; addedAt: string },
  ): Promise<ClientHoldRow | null> {
    const { data: updated, error } = await table()
      .update({
        reason: data.reason,
        notes: data.notes,
        added_by: data.addedBy,
        added_at: data.addedAt,
      })
      .eq("id", id)
      .eq("status", "ACTIVE")
      .select("*")
      .maybeSingle()
    if (error) throw error
    return updated ? toClientHoldRow(updated) : null
  },

  async removeHold(
    id: string,
    data: { removedBy: string; removedAt: string; removedReason: string | null },
  ): Promise<ClientHoldRow | null> {
    const { data: updated, error } = await table()
      .update({
        status: "REMOVED",
        removed_by: data.removedBy,
        removed_at: data.removedAt,
        removed_reason: data.removedReason,
      })
      .eq("id", id)
      .eq("status", "ACTIVE")
      .select("*")
      .maybeSingle()
    if (error) throw error
    return updated ? toClientHoldRow(updated) : null
  },
}
