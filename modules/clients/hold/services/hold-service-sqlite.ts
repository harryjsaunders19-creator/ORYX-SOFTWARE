/**
 * Client holds — SQLite path for local/CI when Supabase admin is not configured.
 * Dual-write was removed; see docs/sqlite-sunset.md.
 */
import type { ClientHoldRow, ClientHoldWithClientRow } from "../types/hold-types"
import { holdDb } from "@/lib/db/stores"

export const holdService = {
  async activeHoldForClient(clientId: string): Promise<ClientHoldRow | null> {
    return holdDb.activeHoldForClient(clientId)
  },

  async activeHoldReasonsFor(clientIds: string[]): Promise<{ clientId: string; reason: string }[]> {
    return holdDb.activeHoldReasonsFor(clientIds)
  },

  async historyForClient(clientId: string): Promise<ClientHoldRow[]> {
    return holdDb.historyForClient(clientId)
  },

  async allActive(): Promise<ClientHoldWithClientRow[]> {
    return holdDb.allActive()
  },

  async allActiveClientIds(): Promise<{ clientId: string }[]> {
    return holdDb.allActive().map(h => ({ clientId: h.clientId }))
  },

  /**
   * Dashboard preview: client names only (no per-client job stats), capped.
   * Use activeCount() for the badge total.
   */
  async allActivePreview(take = 5): Promise<ClientHoldWithClientRow[]> {
    return holdDb.allActive().slice(0, take).map(h => ({
      ...h,
      activeJobCount: 0,
      quoteValueTotal: 0,
    }))
  },

  async allActiveWithNames(): Promise<ClientHoldWithClientRow[]> {
    return holdDb.allActive().map(h => ({
      ...h,
      activeJobCount: 0,
      quoteValueTotal: 0,
    }))
  },

  async activeCount(): Promise<number> {
    return holdDb.activeCount()
  },

  async addHold(data: {
    clientId: string
    reason: string
    notes?: string | null
    addedBy: string
  }): Promise<ClientHoldRow> {
    return holdDb.addHold(data)
  },

  async removeHold(data: {
    clientId: string
    removedBy: string
    removedReason?: string | null
  }): Promise<ClientHoldRow | null> {
    return holdDb.removeHold(data)
  },
}
