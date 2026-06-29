/**
 * Client hold operations during Supabase migration.
 *
 * When SUPABASE_HOLDS=true:
 *   - Reads come from Supabase
 *   - Writes go to Supabase first, then best-effort SQLite mirror
 */
import { db } from "@/lib/db/connection"
import type { ClientHoldRow, ClientHoldWithClientRow } from "@/lib/db/hold-types"
import { holdDb } from "@/lib/db/stores"
import { nowIso } from "@/lib/db/helpers"
import { clientService, ensureClientInSqlite } from "@/lib/services/client-service"
import { useSupabaseHolds, useSupabaseClients } from "@/lib/supabase/feature-flags"
import { supabaseHoldRepo } from "@/lib/supabase/repositories/client-holds"
import { supabaseClientRepo } from "@/lib/supabase/repositories/clients"

async function mirrorHoldToSqlite(hold: ClientHoldRow | null): Promise<void> {
  if (!hold) return
  try {
    await ensureClientInSqlite(hold.clientId)
    holdDb.rawUpsert(hold)
  } catch (err) {
    console.warn("[holdService] SQLite mirror failed:", err)
  }
}

/** Enriches all holds via a single bulk client lookup instead of one call per hold (N+1). */
async function enrichAllWithClientStats(holds: ClientHoldRow[]): Promise<ClientHoldWithClientRow[]> {
  if (!holds.length) return []

  const clientIds = [...new Set(holds.map(h => h.clientId).filter(Boolean))]
  const clients = useSupabaseClients()
    ? await supabaseClientRepo.findManyByIds(clientIds)
    : await Promise.all(clientIds.map(id => clientService.findUnique(id)))
  const clientNameById = new Map(clients.filter(Boolean).map(c => [c!.id, c!.name]))

  return holds.map(hold => {
    const activeJobCount = (
      db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status NOT IN ('ISSUED')").get(hold.clientId) as { n: number }
    ).n
    const quoteValueTotal = (
      db.prepare("SELECT COALESCE(SUM(quoteValue), 0) as n FROM Job WHERE clientId = ? AND quoteValue > 0").get(hold.clientId) as { n: number }
    ).n
    return {
      ...hold,
      clientName: clientNameById.get(hold.clientId) ?? "",
      activeJobCount,
      quoteValueTotal,
    }
  })
}

async function mirror(row: ClientHoldRow | null) {
  if (row && useSupabaseHolds()) await supabaseHoldRepo.upsert(row)
}

export const holdService = {
  async activeHoldForClient(clientId: string): Promise<ClientHoldRow | null> {
    if (!useSupabaseHolds()) return holdDb.activeHoldForClient(clientId)
    return supabaseHoldRepo.activeHoldForClient(clientId)
  },

  async activeHoldReasonsFor(clientIds: string[]): Promise<{ clientId: string; reason: string }[]> {
    if (!useSupabaseHolds()) return holdDb.activeHoldReasonsFor(clientIds)
    return supabaseHoldRepo.activeHoldReasonsFor(clientIds)
  },

  async historyForClient(clientId: string): Promise<ClientHoldRow[]> {
    if (!useSupabaseHolds()) return holdDb.historyForClient(clientId)
    return supabaseHoldRepo.historyForClient(clientId)
  },

  async allActive(): Promise<ClientHoldWithClientRow[]> {
    if (!useSupabaseHolds()) return holdDb.allActive()
    const holds = await supabaseHoldRepo.allActiveHolds()
    return enrichAllWithClientStats(holds)
  },

  async activeCount(): Promise<number> {
    if (!useSupabaseHolds()) return holdDb.activeCount()
    return supabaseHoldRepo.activeCount()
  },

  async addHold(data: {
    clientId: string
    reason: string
    notes?: string | null
    addedBy: string
  }): Promise<ClientHoldRow> {
    const now = nowIso()
    const reason = data.reason.trim()
    const notes = data.notes?.trim() ?? null

    if (useSupabaseHolds()) {
      const existing = await supabaseHoldRepo.activeHoldForClient(data.clientId)
      const hold = existing
        ? await supabaseHoldRepo.updateActiveHold(existing.id, {
            reason,
            notes,
            addedBy: data.addedBy,
            addedAt: now,
          })
        : await supabaseHoldRepo.createHold({
            clientId: data.clientId,
            reason,
            notes,
            addedBy: data.addedBy,
            addedAt: now,
          })
      if (!hold) throw new Error("Failed to save hold in Supabase")
      await mirrorHoldToSqlite(hold)
      return hold
    }

    await ensureClientInSqlite(data.clientId)
    const hold = holdDb.addHold(data)
    await mirror(hold)
    return hold
  },

  async removeHold(data: {
    clientId: string
    removedBy: string
    removedReason?: string | null
  }): Promise<ClientHoldRow | null> {
    const now = nowIso()
    const removedReason = data.removedReason?.trim() ?? null

    if (useSupabaseHolds()) {
      const existing = await supabaseHoldRepo.activeHoldForClient(data.clientId)
      if (!existing) return null
      const hold = await supabaseHoldRepo.removeHold(existing.id, {
        removedBy: data.removedBy,
        removedAt: now,
        removedReason,
      })
      if (hold) await mirrorHoldToSqlite(hold)
      return hold
    }

    await ensureClientInSqlite(data.clientId)
    const hold = holdDb.removeHold(data)
    await mirror(hold)
    return hold
  },
}
