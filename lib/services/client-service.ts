/**
 * lib/services/client-service.ts
 *
 * Async client operations for API routes during Supabase migration.
 *
 * When SUPABASE_CLIENTS=true:
 *   - Reads come from Supabase
 *   - Writes go to Supabase AND SQLite (dual-write) so jobs/quotes routes
 *     that still use sync clientDb keep working
 *
 * When flag is false (default):
 *   - Everything uses SQLite only (unchanged behaviour)
 */
import { db } from "@/lib/db/connection"
import { nowIso } from "@/lib/db/helpers"
import { clientDb } from "@/lib/db/stores"
import type { ClientRow, CreateClientData, UpdateClientData } from "@/lib/db/client-types"
import { useSupabaseClients } from "@/lib/supabase/feature-flags"
import { supabaseClientRepo } from "@/lib/supabase/repositories/clients"

function sqliteActiveJobCount(clientId: string): number {
  return (db.prepare("SELECT COUNT(*) as n FROM Job WHERE clientId = ? AND status != 'ISSUED'").get(clientId) as { n: number }).n
}

function sqliteOnHold(clientId: string): boolean {
  return (db.prepare("SELECT COUNT(*) as n FROM ClientHold WHERE clientId = ? AND status = 'ACTIVE'").get(clientId) as { n: number }).n > 0
}

function withMeta(client: ClientRow): ClientRow & { activeJobCount: number; onHold: boolean } {
  return {
    ...client,
    activeJobCount: sqliteActiveJobCount(client.id),
    onHold: sqliteOnHold(client.id),
  }
}

/** Mirror a create/update/archive/delete to SQLite so other modules stay in sync. */
/**
 * Ensures a client exists in the local SQLite DB by fetching it from Supabase
 * if missing. Mirrors the ensureJobInSqlite pattern — needed because other tables
 * (Quote, ClientHold) have FK constraints on Client.id, and on a fresh Vercel
 * container the SQLite Client table is empty.
 */
export async function ensureClientInSqlite(clientId: string | null | undefined): Promise<void> {
  if (!clientId || !useSupabaseClients()) return
  if (clientDb.findUnique(clientId)) return
  try {
    const client = await supabaseClientRepo.findUnique(clientId)
    if (client) clientDb.rawInsertOrIgnore(client)
  } catch {
    // Non-fatal: worst case the FK constraint fires and we get a 500,
    // which is more informative than silently swallowing it here.
  }
}

function mirrorCreate(data: CreateClientData): ClientRow {
  const existing = clientDb.findUnique(data.id)
  if (existing) return existing
  return clientDb.create(data)
}

function mirrorUpdate(id: string, data: UpdateClientData): ClientRow | null {
  return clientDb.update(id, data)
}

export const clientService = {
  async findManyWithMeta(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}) {
    if (!useSupabaseClients()) {
      return clientDb.findManyWithMeta(opts)
    }
    const clients = await supabaseClientRepo.findMany(opts)
    return clients.map(withMeta)
  },

  async count(opts: { search?: string; activeOnly?: boolean } = {}) {
    if (!useSupabaseClients()) return clientDb.count(opts)
    return supabaseClientRepo.count(opts)
  },

  async findUnique(id: string): Promise<ClientRow | null> {
    if (!useSupabaseClients()) return clientDb.findUnique(id)
    return supabaseClientRepo.findUnique(id)
  },

  async findByName(name: string): Promise<ClientRow | null> {
    if (!useSupabaseClients()) return clientDb.findByName(name)
    return supabaseClientRepo.findByName(name)
  },

  async search(q: string, limit = 10): Promise<ClientRow[]> {
    if (!useSupabaseClients()) return clientDb.search(q, limit)
    return supabaseClientRepo.search(q, limit)
  },

  async create(data: CreateClientData): Promise<ClientRow> {
    if (!useSupabaseClients()) return clientDb.create(data)
    const now = nowIso()
    const created = await supabaseClientRepo.create(data, now)
    mirrorCreate(data)
    return created
  },

  async update(id: string, data: UpdateClientData): Promise<ClientRow | null> {
    if (!useSupabaseClients()) return clientDb.update(id, data)
    const existing = await supabaseClientRepo.findUnique(id)
    if (!existing) return null
    const updated = await supabaseClientRepo.update(id, data, existing, nowIso())
    if (updated) mirrorUpdate(id, data)
    return updated
  },

  async archive(id: string): Promise<ClientRow | null> {
    return this.update(id, { active: 0 })
  },

  async delete(id: string): Promise<boolean> {
    if (!useSupabaseClients()) return clientDb.delete(id)
    const ok = await supabaseClientRepo.delete(id)
    if (ok) clientDb.delete(id)
    return ok
  },

  /** Still SQLite-only — jobs table not migrated yet */
  stats(clientId: string) {
    return clientDb.stats(clientId)
  },

  /** Still SQLite-only — jobs table not migrated yet */
  jobsForClient(clientId: string, limit = 50) {
    return clientDb.jobsForClient(clientId, limit)
  },
}
