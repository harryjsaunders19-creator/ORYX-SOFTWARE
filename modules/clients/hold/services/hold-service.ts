/**
 * Client hold operations during Supabase migration.
 *
 * When SUPABASE_HOLDS=true:
 *   - Reads come from Supabase
 *   - Writes go to Supabase (SQLite mirror only in dual-write local dev)
 */
import type { ClientHoldRow, ClientHoldWithClientRow } from "../types/hold-types"
import { holdDb } from "@/lib/db/stores"
import { nowIso } from "@/lib/db/helpers"
import { clientService } from "../../services/client-service"
import { useSupabaseHolds, useSupabaseClients, useSupabaseJobs, isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { supabaseHoldRepo } from "../supabase/repository"
import { supabaseClientRepo } from "../../supabase/repository"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"

async function mirrorHoldToSqlite(hold: ClientHoldRow | null): Promise<void> {
  if (!hold || isSupabaseOnly()) return
  try {
    const { ensureClientInSqlite } = await import("../../services/client-service")
    await ensureClientInSqlite(hold.clientId)
    holdDb.rawUpsert(hold)
  } catch (err) {
    console.warn("[holdService] SQLite mirror failed:", err)
  }
}

/** Batch job stats for many clients in one query (avoids N+1 in hold enrichment). */
async function batchClientJobStats(
  clientIds: string[],
): Promise<Map<string, { activeJobCount: number; quoteValueTotal: number }>> {
  if (!clientIds.length) return new Map()
  if (useSupabaseJobs()) {
    return supabaseJobRepo.clientJobStatsForHolds(clientIds)
  }
  const { db } = await import("@/lib/db/connection")
  const map = new Map<string, { activeJobCount: number; quoteValueTotal: number }>()
  const placeholders = clientIds.map(() => "?").join(",")
  const rows = db.prepare(`
    SELECT clientId,
           SUM(CASE WHEN status NOT IN ('ISSUED') THEN 1 ELSE 0 END) AS activeJobCount,
           COALESCE(SUM(CASE WHEN quoteValue > 0 THEN quoteValue ELSE 0 END), 0) AS quoteValueTotal
    FROM Job
    WHERE clientId IN (${placeholders})
    GROUP BY clientId
  `).all(...clientIds) as { clientId: string; activeJobCount: number; quoteValueTotal: number }[]

  for (const row of rows) {
    map.set(row.clientId, {
      activeJobCount: row.activeJobCount,
      quoteValueTotal: row.quoteValueTotal,
    })
  }
  return map
}

/** Enriches all holds via a single bulk client lookup instead of one call per hold (N+1). */
async function enrichAllWithClientStats(holds: ClientHoldRow[]): Promise<ClientHoldWithClientRow[]> {
  if (!holds.length) return []

  const clientIds = [...new Set(holds.map(h => h.clientId).filter(Boolean))]
  const [clients, statsByClient] = await Promise.all([
    useSupabaseClients()
      ? supabaseClientRepo.findManyByIds(clientIds)
      : clientService.findManyByIds(clientIds),
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

  /**
   * Dashboard preview: client names only (no per-client job stats), capped.
   * Use activeCount() for the badge total.
   */
  async allActivePreview(take = 5): Promise<ClientHoldWithClientRow[]> {
    if (!useSupabaseHolds()) {
      return holdDb.allActive().slice(0, take).map(h => ({
        ...h,
        activeJobCount: 0,
        quoteValueTotal: 0,
      }))
    }
    const holds = (await supabaseHoldRepo.allActiveHolds()).slice(0, take)
    if (!holds.length) return []
    const clientIds = [...new Set(holds.map(h => h.clientId).filter(Boolean))]
    const clients = useSupabaseClients()
      ? await supabaseClientRepo.findManyByIds(clientIds)
      : await clientService.findManyByIds(clientIds)
    const clientNameById = new Map(clients.filter(Boolean).map(c => [c!.id, c!.name]))
    return holds.map(hold => ({
      ...hold,
      clientName: clientNameById.get(hold.clientId) ?? "",
      activeJobCount: 0,
      quoteValueTotal: 0,
    }))
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

    const { ensureClientInSqlite } = await import("../../services/client-service")
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

    const { ensureClientInSqlite } = await import("../../services/client-service")
    await ensureClientInSqlite(data.clientId)
    const hold = holdDb.removeHold(data)
    await mirror(hold)
    return hold
  },
}
