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
import { useSupabaseClients, useSupabaseJobs } from "@/lib/supabase/feature-flags"
import { supabaseClientRepo } from "../supabase/repository"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { archiveLogService } from "@/lib/services/archive-log-service"
import { probeArchivedColumns } from "@/lib/supabase/archived-filter"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { clientContactService } from "./client-contact-service"

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
  async findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): Promise<ClientRow[]> {
    if (!useSupabaseClients()) return clientDb.findMany(opts)
    return supabaseClientRepo.findMany(opts)
  },

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
      mirrorCreate(payload)
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
      mirrorUpdate(id, patch)
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
      if (updated) {
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
      if (updated) {
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

  /** Still SQLite-only — jobs table not migrated yet */
  stats(clientId: string) {
    return clientDb.stats(clientId)
  },

  /** Still SQLite-only — jobs table not migrated yet */
  jobsForClient(clientId: string, limit = 50) {
    return clientDb.jobsForClient(clientId, limit)
  },

  contactsForClient(clientId: string) {
    return clientContactService.findByClientId(clientId)
  },
}
