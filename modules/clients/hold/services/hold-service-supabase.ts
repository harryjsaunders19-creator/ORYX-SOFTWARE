/**
 * Client holds — Supabase-only path (Vercel / isSupabaseOnly).
 * Dual-write / SQLite mirror removed; see docs/sqlite-sunset.md.
 */
import type { ClientHoldRow, ClientHoldWithClientRow } from "../types/hold-types"
import { nowIso } from "@/lib/db/helpers"
import { supabaseHoldRepo } from "../supabase/repository"
import { supabaseClientRepo } from "../../supabase/repository"
import { supabaseJobRepo } from "@/modules/jobs/supabase/repository"

/** Batch job stats for many clients in one query (avoids N+1 in hold enrichment). */
async function batchClientJobStats(
  clientIds: string[],
): Promise<Map<string, { activeJobCount: number; quoteValueTotal: number }>> {
  if (!clientIds.length) return new Map()
  return supabaseJobRepo.clientJobStatsForHolds(clientIds)
}

/** Enriches all holds via a single bulk client lookup instead of one call per hold (N+1). */
async function enrichAllWithClientStats(holds: ClientHoldRow[]): Promise<ClientHoldWithClientRow[]> {
  if (!holds.length) return []

  const clientIds = [...new Set(holds.map(h => h.clientId).filter(Boolean))]
  const [clients, statsByClient] = await Promise.all([
    supabaseClientRepo.findManyByIds(clientIds),
    batchClientJobStats(clientIds),
  ])
  const clientNameById = new Map(clients.filter(Boolean).map(c => [c!.id, c!.name]))

  return holds.map(hold => {
    const stats = statsByClient.get(hold.clientId) ?? { activeJobCount: 0, quoteValueTotal: 0 }
    return {
      ...hold,
      clientName: clientNameById.get(hold.clientId) ?? "",
      activeJobCount: stats.activeJobCount,
      quoteValueTotal: stats.quoteValueTotal,
    }
  })
}

export const holdService = {
  async activeHoldForClient(clientId: string): Promise<ClientHoldRow | null> {
    return supabaseHoldRepo.activeHoldForClient(clientId)
  },

  async activeHoldReasonsFor(clientIds: string[]): Promise<{ clientId: string; reason: string }[]> {
    return supabaseHoldRepo.activeHoldReasonsFor(clientIds)
  },

  async historyForClient(clientId: string): Promise<ClientHoldRow[]> {
    return supabaseHoldRepo.historyForClient(clientId)
  },

  async allActive(): Promise<ClientHoldWithClientRow[]> {
    const holds = await supabaseHoldRepo.allActiveHolds()
    return enrichAllWithClientStats(holds)
  },

  /**
   * Dashboard preview: client names only (no per-client job stats), capped.
   * Use activeCount() for the badge total.
   */
  async allActivePreview(take = 5): Promise<ClientHoldWithClientRow[]> {
    const holds = (await supabaseHoldRepo.allActiveHolds()).slice(0, take)
    if (!holds.length) return []
    const clientIds = [...new Set(holds.map(h => h.clientId).filter(Boolean))]
    const clients = await supabaseClientRepo.findManyByIds(clientIds)
    const clientNameById = new Map(clients.filter(Boolean).map(c => [c!.id, c!.name]))
    return holds.map(hold => ({
      ...hold,
      clientName: clientNameById.get(hold.clientId) ?? "",
      activeJobCount: 0,
      quoteValueTotal: 0,
    }))
  },

  async activeCount(): Promise<number> {
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
    return hold
  },

  async removeHold(data: {
    clientId: string
    removedBy: string
    removedReason?: string | null
  }): Promise<ClientHoldRow | null> {
    const now = nowIso()
    const removedReason = data.removedReason?.trim() ?? null

    const existing = await supabaseHoldRepo.activeHoldForClient(data.clientId)
    if (!existing) return null
    return supabaseHoldRepo.removeHold(existing.id, {
      removedBy: data.removedBy,
      removedAt: now,
      removedReason,
    })
  },
}
