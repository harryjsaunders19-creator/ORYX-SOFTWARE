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
import type { ClientRow, CreateClientData, UpdateClientData } from "../types/client-types"
import type { ClientContactInput } from "../types/client-contact-types"
import { primaryContactFields } from "../types/client-contact-types"
import { useSupabaseClients, useSupabaseJobs, useSupabaseHolds, isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { supabaseClientRepo } from "../supabase/repository"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseHoldRepo } from "../hold/supabase/repository"
import { holdDb } from "@/lib/db/stores"
import { archiveLogService } from "@/lib/services/archive-log-service"
import { probeArchivedColumns } from "@/lib/supabase/archived-filter"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { clientContactService } from "./client-contact-service"

/** Batch active-job counts and hold flags for a page of clients (avoids N+1 on Supabase). */
async function batchClientMeta(
  clientIds: string[],
): Promise<Map<string, { activeJobCount: number; onHold: boolean }>> {
  const map = new Map<string, { activeJobCount: number; onHold: boolean }>()
  for (const id of clientIds) {
    map.set(id, { activeJobCount: 0, onHold: false })
  }
  if (!clientIds.length) return map

  if (useSupabaseJobs()) {
    const counts = await supabaseJobRepo.activeJobCountsForClients(clientIds)
    for (const [clientId, n] of counts) {
      const entry = map.get(clientId)
      if (entry) entry.activeJobCount = n
    }
  } else {
    const placeholders = clientIds.map(() => "?").join(",")
    const rows = db.prepare(`
      SELECT clientId, COUNT(*) as n FROM Job
      WHERE clientId IN (${placeholders}) AND status != 'ISSUED'
      GROUP BY clientId
    `).all(...clientIds) as { clientId: string; n: number }[]
    for (const row of rows) {
      const entry = map.get(row.clientId)
      if (entry) entry.activeJobCount = row.n
    }
  }

  const holdRows = useSupabaseHolds()
    ? await supabaseHoldRepo.activeHoldReasonsFor(clientIds)
    : holdDb.activeHoldReasonsFor(clientIds)
  for (const row of holdRows) {
    const entry = map.get(row.clientId)
    if (entry) entry.onHold = true
  }

  return map
}

/** Mirror a create/update/archive/delete to SQLite so other modules stay in sync. */
/**
 * Ensures a client exists in the local SQLite DB by fetching it from Supabase
 * if missing. Mirrors the ensureJobInSqlite pattern — needed because other tables
 * (Quote, ClientHold) have FK constraints on Client.id, and on a fresh Vercel
 * container the SQLite Client table is empty.
 */
export async function ensureClientInSqlite(clientId: string | null | undefined): Promise<void> {
  if (!clientId || !useSupabaseClients() || isSupabaseOnly()) return
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
  async findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): Promise<ClientRow[]> {
    if (!useSupabaseClients()) return clientDb.findMany(opts)
    return supabaseClientRepo.findMany(opts)
  },

  async findManyWithMeta(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}) {
    if (!useSupabaseClients()) {
      return clientDb.findManyWithMeta(opts)
    }
    const clients = await supabaseClientRepo.findMany(opts)
    const meta = await batchClientMeta(clients.map(c => c.id))
    return clients.map(c => ({
      ...c,
      ...(meta.get(c.id) ?? { activeJobCount: 0, onHold: false }),
    }))
  },

  async count(opts: { search?: string; activeOnly?: boolean } = {}) {
    if (!useSupabaseClients()) return clientDb.count(opts)
    return supabaseClientRepo.count(opts)
  },

  async findUnique(id: string): Promise<ClientRow | null> {
    if (!useSupabaseClients()) return clientDb.findUnique(id)
    return supabaseClientRepo.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<ClientRow[]> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return []
    if (!useSupabaseClients()) return clientDb.findManyByIds(unique)
    return supabaseClientRepo.findManyByIds(unique)
  },

  async findByName(name: string): Promise<ClientRow | null> {
    if (!useSupabaseClients()) return clientDb.findByName(name)
    return supabaseClientRepo.findByName(name)
  },

  async search(q: string, limit = 10): Promise<ClientRow[]> {
    if (!useSupabaseClients()) return clientDb.search(q, limit)
    return supabaseClientRepo.search(q, limit)
  },

  async create(data: CreateClientData & { contacts?: ClientContactInput[] }): Promise<ClientRow> {
    const primary = data.contacts?.length
      ? primaryContactFields(data.contacts)
      : {
          contactName: data.contactName ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
        }
    const payload: CreateClientData = {
      ...data,
      contactName: primary.contactName,
      email: primary.email,
      phone: primary.phone,
    }

    let created: ClientRow
    if (!useSupabaseClients()) {
      created = clientDb.create(payload)
    } else {
      const now = nowIso()
      created = await supabaseClientRepo.create(payload, now)
      if (!isSupabaseOnly()) mirrorCreate(payload)
    }

    if (data.contacts !== undefined) {
      await clientContactService.replaceForClient(created.id, data.contacts)
    } else if (primary.contactName || primary.email || primary.phone) {
      await clientContactService.replaceForClient(created.id, [{
        name: primary.contactName ?? "",
        email: primary.email,
        phone: primary.phone,
      }])
    }

    return created
  },

  async update(
    id: string,
    data: UpdateClientData & { contacts?: ClientContactInput[] },
  ): Promise<ClientRow | null> {
    const primary = data.contacts !== undefined
      ? primaryContactFields(data.contacts)
      : null
    const patch: UpdateClientData = {
      ...data,
      ...(primary && {
        contactName: primary.contactName,
        email: primary.email,
        phone: primary.phone,
      }),
    }
    delete (patch as { contacts?: ClientContactInput[] }).contacts

    if (!useSupabaseClients()) {
      const updated = clientDb.update(id, patch)
      if (updated && data.contacts !== undefined) {
        await clientContactService.replaceForClient(id, data.contacts)
      }
      return updated
    }

    const existing = await supabaseClientRepo.findUnique(id)
    if (!existing) return null
    const updated = await supabaseClientRepo.update(id, patch, existing, nowIso())
    if (updated) {
      if (!isSupabaseOnly()) mirrorUpdate(id, patch)
      if (data.contacts !== undefined) {
        await clientContactService.replaceForClient(id, data.contacts)
      }
    }
    return updated
  },

  async archive(id: string, archiverId = "System", archiverName = "System"): Promise<ClientRow | null> {
    const client = await this.findUnique(id)
    if (!client) return null
    const now = nowIso()
    let updated: ClientRow | null
    if (!useSupabaseClients()) {
      updated = clientDb.update(id, { active: 0, archivedAt: now, archivedBy: archiverId })
    } else {
      await probeArchivedColumns()
      updated = await supabaseClientRepo.archive(id, archiverId, now)
      if (updated && !isSupabaseOnly()) {
        await ensureClientInSqlite(id)
        clientDb.update(id, { active: 0, archivedAt: now, archivedBy: archiverId })
      }
    }
    if (updated) {
      archiveLogService.log({
        entityType: "client", entityId: id,
        entityLabel: client.name,
        action: "archive",
        performedBy: archiverId, performedByName: archiverName,
      })
    }
    return updated
  },

  async findArchived(): Promise<ClientRow[]> {
    if (useSupabaseClients()) {
      return supabaseClientRepo.findArchived()
    }
    const local = clientDb.findMany({ activeOnly: false }).filter(c => c.active === 0)
    if (local.length > 0 || !isSupabaseAdminConfigured()) return local
    return supabaseClientRepo.findArchived()
  },

  async restore(id: string, restorerId = "System", restorerName = "System"): Promise<ClientRow | null> {
    const client = await this.findUnique(id)
    if (!client) return null
    const now = nowIso()
    let updated: ClientRow | null
    if (!useSupabaseClients()) {
      updated = clientDb.update(id, { active: 1, archivedAt: null, archivedBy: null })
    } else {
      updated = await supabaseClientRepo.restore(id, now)
      if (updated && !isSupabaseOnly()) {
        await ensureClientInSqlite(id)
        clientDb.update(id, { active: 1, archivedAt: null, archivedBy: null })
      }
    }
    if (updated) {
      archiveLogService.log({
        entityType: "client", entityId: id,
        entityLabel: client.name,
        action: "restore",
        performedBy: restorerId, performedByName: restorerName,
      })
    }
    return updated
  },

  /** Job count for archive vs hard-delete — uses Supabase when jobs module is on. */
  async totalJobCount(clientId: string): Promise<number> {
    if (useSupabaseJobs()) return supabaseJobRepo.count({ clientId })
    return clientDb.stats(clientId).totalJobs
  },

  async delete(id: string): Promise<boolean> {
    if (!useSupabaseClients()) return clientDb.delete(id)
    const ok = await supabaseClientRepo.delete(id)
    if (ok) clientDb.delete(id)
    return ok
  },

  async stats(clientId: string) {
    return clientDb.stats(clientId)
  },

  async jobsForClient(clientId: string, limit = 50) {
    return clientDb.jobsForClient(clientId, limit)
  },

  contactsForClient(clientId: string) {
    return clientContactService.findByClientId(clientId)
  },
}
