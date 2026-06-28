/**
 * Client hold operations during Supabase migration.
 *
 * When SUPABASE_HOLDS=true:
 *   - Reads come from Supabase
 *   - Writes SQLite first, then mirror hold row to Supabase
 */
import { db } from "@/lib/db/connection"
import type { ClientHoldRow, ClientHoldWithClientRow } from "@/lib/db/hold-types"
import { holdDb } from "@/lib/db/stores"
import { clientService, ensureClientInSqlite } from "@/lib/services/client-service"
import { useSupabaseHolds, useSupabaseClients } from "@/lib/supabase/feature-flags"
import { supabaseHoldRepo } from "@/lib/supabase/repositories/client-holds"
import { supabaseClientRepo } from "@/lib/supabase/repositories/clients"

/**
 * Ensures the active hold for a client exists in the local SQLite DB by
 * fetching it from Supabase if missing. Needed for removeHold on a fresh
 * Vercel container where the SQLite ClientHold table is empty.
 */
async function ensureActiveHoldInSqlite(clientId: string): Promise<void> {
  if (!useSupabaseHolds()) return
  if (holdDb.activeHoldForClient(clientId)) return
  try {
    const hold = await supabaseHoldRepo.activeHoldForClient(clientId)
    if (hold) holdDb.rawInsertOrIgnore(hold)
  } catch {
    // Non-fatal
  }
}

/** Enriches a single hold with client stats — used on the SQLite path (fast local queries). */
async function enrichWithClientStats(hold: ClientHoldRow): Promise<ClientHoldWithClientRow> {
  const client = await clientService.findUnique(hold.clientId)
  const activeJobCount = (
    db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status NOT IN ('ISSUED')").get(hold.clientId) as { n: number }
  ).n
  const quoteValueTotal = (
    db.prepare("SELECT COALESCE(SUM(quoteValue), 0) as n FROM Job WHERE clientId = ? AND quoteValue > 0").get(hold.clientId) as { n: number }
  ).n
  return {
    ...hold,
    clientName: client?.name ?? "",
    activeJobCount,
    quoteValueTotal,
  }
}

/**
 * Supabase path: enriches all holds via a single bulk client lookup instead of
 * one Supabase call per hold (N+1). The SQLite job-count queries are cheap
 * local reads and are kept as-is.
 */
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
    // ClientHold.clientId has NOT NULL FK on Client.id — ensure client is in SQLite first.
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
    // Sync the active hold from Supabase so removeHold can find and update it.
    await ensureClientInSqlite(data.clientId)
    await ensureActiveHoldInSqlite(data.clientId)
    const hold = holdDb.removeHold(data)
    await mirror(hold)
    return hold
  },
}
