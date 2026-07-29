/**
 * Clients — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads client-service-supabase.ts instead (isSupabaseOnly()).
 */
import { nowIso } from "@/lib/db/helpers"
import { clientDb } from "@/lib/db/stores"
import type { ClientRow, CreateClientData, UpdateClientData } from "../types/client-types"
import type { ClientContactInput } from "../types/client-contact-types"
import { primaryContactFields } from "../types/client-contact-types"
import { archiveLogService } from "@/modules/archive"
import { clientContactService } from "./client-contact-service"

/** No-op on SQLite-only — clients already live in SQLite. */
export async function ensureClientInSqlite(_clientId: string | null | undefined): Promise<void> {
  return
}

export const clientService = {
  async findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): Promise<ClientRow[]> {
    return clientDb.findMany(opts)
  },

  async findManyWithMeta(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}) {
    return clientDb.findManyWithMeta(opts)
  },

  async count(opts: { search?: string; activeOnly?: boolean } = {}) {
    return clientDb.count(opts)
  },

  async findUnique(id: string): Promise<ClientRow | null> {
    return clientDb.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<ClientRow[]> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return []
    return clientDb.findManyByIds(unique)
  },

  async findByName(name: string): Promise<ClientRow | null> {
    return clientDb.findByName(name)
  },

  async search(q: string, limit = 10): Promise<ClientRow[]> {
    return clientDb.search(q, limit)
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

    const created = clientDb.create(payload)

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

    const updated = clientDb.update(id, patch)
    if (updated && data.contacts !== undefined) {
      await clientContactService.replaceForClient(id, data.contacts)
    }
    return updated
  },

  async archive(id: string, archiverId = "System", archiverName = "System"): Promise<ClientRow | null> {
    const client = await this.findUnique(id)
    if (!client) return null
    const now = nowIso()
    const updated = clientDb.update(id, { active: 0, archivedAt: now, archivedBy: archiverId })
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
    return clientDb.findMany({ activeOnly: false }).filter(c => c.active === 0)
  },

  async restore(id: string, restorerId = "System", restorerName = "System"): Promise<ClientRow | null> {
    const client = await this.findUnique(id)
    if (!client) return null
    const updated = clientDb.update(id, { active: 1, archivedAt: null, archivedBy: null })
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

  async totalJobCount(clientId: string): Promise<number> {
    return clientDb.stats(clientId).totalJobs
  },

  async delete(id: string): Promise<boolean> {
    return clientDb.delete(id)
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
