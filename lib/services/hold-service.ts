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
import { useSupabaseHolds } from "@/lib/supabase/feature-flags"
import { supabaseHoldRepo } from "@/lib/supabase/repositories/client-holds"

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
    return Promise.all(holds.map(enrichWithClientStats))
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
