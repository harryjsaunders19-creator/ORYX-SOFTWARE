/**
 * Supabase-only client operations (Vercel / isSupabaseOnly).
 * Never imports SQLite connection/stores or archive-log-service.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import type { ClientRow, CreateClientData, UpdateClientData } from "../types/client-types"
import type { ClientContactInput } from "../types/client-contact-types"
import { primaryContactFields, normalizeContactInputs } from "../types/client-contact-types"
import { probeArchivedColumns } from "@/lib/supabase/archived-filter"
import { supabaseArchiveLogRepo } from "@/modules/archive/supabase/repository"
import { supabaseJobRepo } from "@/lib/supabase/repositories/jobs"
import { supabaseClientRepo } from "../supabase/repository"
import { supabaseClientContactRepo } from "../supabase/client-contact-repository"
import { supabaseHoldRepo } from "../hold/supabase/repository"

async function batchClientMeta(
  clientIds: string[],
): Promise<Map<string, { activeJobCount: number; onHold: boolean }>> {
  const map = new Map<string, { activeJobCount: number; onHold: boolean }>()
  for (const id of clientIds) {
    map.set(id, { activeJobCount: 0, onHold: false })
  }
  if (!clientIds.length) return map

  const counts = await supabaseJobRepo.activeJobCountsForClients(clientIds)
  for (const [clientId, n] of counts) {
    const entry = map.get(clientId)
    if (entry) entry.activeJobCount = n
  }

  const holdRows = await supabaseHoldRepo.activeHoldReasonsFor(clientIds)
  for (const row of holdRows) {
    const entry = map.get(row.clientId)
    if (entry) entry.onHold = true
  }

  return map
}

async function logArchive(opts: {
  entityId: string
  entityLabel: string
  action: "archive" | "restore"
  performedBy: string
  performedByName: string
}): Promise<void> {
  try {
    await supabaseArchiveLogRepo.insert({
      id: nanoid(),
      entityType: "client",
      entityId: opts.entityId,
      entityLabel: opts.entityLabel,
      action: opts.action,
      performedBy: opts.performedBy,
      performedByName: opts.performedByName,
      performedAt: nowIso(),
      reason: null,
    })
  } catch (err) {
    console.warn("[clientService] archive log failed:", err)
  }
}

/** No-op on Supabase-only — there is no local SQLite to sync into. */
export async function ensureClientInSqlite(_clientId: string | null | undefined): Promise<void> {
  return
}

export const clientService = {
  async findMany(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}): Promise<ClientRow[]> {
    return supabaseClientRepo.findMany(opts)
  },

  async findManyWithMeta(opts: { search?: string; activeOnly?: boolean; skip?: number; take?: number } = {}) {
    const clients = await supabaseClientRepo.findMany(opts)
    const meta = await batchClientMeta(clients.map(c => c.id))
    return clients.map(c => ({
      ...c,
      ...(meta.get(c.id) ?? { activeJobCount: 0, onHold: false }),
    }))
  },

  async count(opts: { search?: string; activeOnly?: boolean } = {}) {
    return supabaseClientRepo.count(opts)
  },

  async findUnique(id: string): Promise<ClientRow | null> {
    return supabaseClientRepo.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<ClientRow[]> {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return []
    return supabaseClientRepo.findManyByIds(unique)
  },

  async findByName(name: string): Promise<ClientRow | null> {
    return supabaseClientRepo.findByName(name)
  },

  async search(q: string, limit = 10): Promise<ClientRow[]> {
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

    const now = nowIso()
    const created = await supabaseClientRepo.create(payload, now)

    if (data.contacts !== undefined) {
      await supabaseClientContactRepo.replaceForClient(created.id, normalizeContactInputs(data.contacts), now)
    } else if (primary.contactName || primary.email || primary.phone) {
      await supabaseClientContactRepo.replaceForClient(created.id, normalizeContactInputs([{
        name: primary.contactName ?? "",
        email: primary.email,
        phone: primary.phone,
      }]), now)
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

    const existing = await supabaseClientRepo.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    const updated = await supabaseClientRepo.update(id, patch, existing, now)
    if (updated && data.contacts !== undefined) {
      await supabaseClientContactRepo.replaceForClient(id, normalizeContactInputs(data.contacts), now)
    }
    return updated
  },

  async archive(id: string, archiverId = "System", archiverName = "System"): Promise<ClientRow | null> {
    const client = await this.findUnique(id)
    if (!client) return null
    const now = nowIso()
    await probeArchivedColumns()
    const updated = await supabaseClientRepo.archive(id, archiverId, now)
    if (updated) {
      await logArchive({
        entityId: id,
        entityLabel: client.name,
        action: "archive",
        performedBy: archiverId,
        performedByName: archiverName,
      })
    }
    return updated
  },

  async findArchived(): Promise<ClientRow[]> {
    return supabaseClientRepo.findArchived()
  },

  async restore(id: string, restorerId = "System", restorerName = "System"): Promise<ClientRow | null> {
    const client = await this.findUnique(id)
    if (!client) return null
    const now = nowIso()
    const updated = await supabaseClientRepo.restore(id, now)
    if (updated) {
      await logArchive({
        entityId: id,
        entityLabel: client.name,
        action: "restore",
        performedBy: restorerId,
        performedByName: restorerName,
      })
    }
    return updated
  },

  async totalJobCount(clientId: string): Promise<number> {
    return supabaseJobRepo.count({ clientId })
  },

  async delete(id: string): Promise<boolean> {
    return supabaseClientRepo.delete(id)
  },

  async stats(clientId: string): Promise<{
    totalJobs: number
    activeJobs: number
    issuedJobs: number
    totalRevisions: number
    totalQuotedValue: number
    totalInvoicedValue: number
  }> {
    const jobs = await supabaseJobRepo.findMany({ where: { clientId }, take: 10000 })
    const activeJobs = jobs.filter(j => j.status !== "ISSUED")
    const issuedJobs = jobs.filter(j => j.status === "ISSUED")
    const totalRevisions = jobs.filter(j => j.itemType === "REVISION")
    const totalQuotedValue = jobs.reduce((sum, j) => sum + (j.quoteValue && j.quoteValue > 0 ? j.quoteValue : 0), 0)
    return {
      totalJobs: jobs.length,
      activeJobs: activeJobs.length,
      issuedJobs: issuedJobs.length,
      totalRevisions: totalRevisions.length,
      totalQuotedValue,
      totalInvoicedValue: 0,
    }
  },

  async jobsForClient(clientId: string, limit = 50) {
    return supabaseJobRepo.findMany({
      where: { clientId },
      take: limit,
      orderBy: { field: "createdAt", dir: "desc" },
    })
  },

  contactsForClient(clientId: string) {
    return supabaseClientContactRepo.findByClientId(clientId)
  },
}
