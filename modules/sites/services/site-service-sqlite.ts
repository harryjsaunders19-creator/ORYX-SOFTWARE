/**
 * Sites — SQLite path for local/CI when Supabase admin is not configured.
 */
import { createId } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { siteDb } from "@/lib/db/stores"
import { clientDb } from "@/lib/db/stores"
import type {
  SiteRow,
  CreateSiteData,
  UpdateSiteData,
  SiteSummary,
  SiteJobCounts,
  SiteAuditEventRow,
} from "../types/site-types"
import { formatSiteAddress, siteSimilarity } from "../lib/normalize"

export const siteService = {
  async findUnique(id: string): Promise<SiteRow | null> {
    return siteDb.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<SiteRow[]> {
    return siteDb.findManyByIds(ids)
  },

  async search(opts: {
    clientId: string
    q?: string
    activeOnly?: boolean
    includeArchived?: boolean
    limit?: number
  }): Promise<SiteSummary[]> {
    const rows = siteDb.search(opts)
    return rows.map(r => ({
      ...r,
      jobCounts: siteDb.jobCounts(r.id),
    }))
  },

  async listForClient(
    clientId: string,
    opts: { activeOnly?: boolean; search?: string; take?: number } = {},
  ): Promise<SiteSummary[]> {
    const rows = siteDb.findByClient(clientId, opts)
    const client = clientDb.findUnique(clientId)
    return rows.map(r => ({
      ...r,
      clientName: client?.name ?? null,
      jobCounts: siteDb.jobCounts(r.id),
    }))
  },

  async getSummary(id: string): Promise<SiteSummary | null> {
    const site = siteDb.findUnique(id)
    if (!site) return null
    const client = clientDb.findUnique(site.clientId)
    return {
      ...site,
      clientName: client?.name ?? null,
      jobCounts: siteDb.jobCounts(id),
    }
  },

  async create(
    data: Omit<CreateSiteData, "id"> & { id?: string },
    actor: { id?: string; name?: string } = {},
  ): Promise<SiteRow> {
    const id = data.id ?? createId()
    const created = siteDb.create({ ...data, id })
    try {
      siteDb.logAudit({
        siteId: id,
        action: "created",
        summary: `Managed Site created under client: ${created.name}`,
        performedBy: actor.id ?? "System",
        performedByName: actor.name ?? "System",
      })
    } catch (err) {
      console.warn("[sites] audit log failed after create:", err)
    }
    return created
  },

  async update(
    id: string,
    data: UpdateSiteData,
    actor: { id?: string; name?: string } = {},
  ): Promise<SiteRow | null> {
    const existing = siteDb.findUnique(id)
    if (!existing) return null
    const addressChanged =
      data.addressLine1 !== undefined
      || data.addressLine2 !== undefined
      || data.city !== undefined
      || data.county !== undefined
      || data.postcode !== undefined
      || data.country !== undefined
      || data.name !== undefined
    const updated = siteDb.update(id, data)
    if (updated) {
      siteDb.logAudit({
        siteId: id,
        action: addressChanged ? "address_updated" : "updated",
        summary: addressChanged
          ? `Site address updated: ${updated.name}`
          : `Site updated: ${updated.name}`,
        performedBy: actor.id ?? "System",
        performedByName: actor.name ?? "System",
      })
    }
    return updated
  },

  async archive(
    id: string,
    actor: { id?: string; name?: string } = {},
  ): Promise<{ ok: true; site: SiteRow } | { ok: false; error: string; jobCount: number }> {
    const site = siteDb.findUnique(id)
    if (!site) return { ok: false, error: "Site not found", jobCount: 0 }
    const jobCount = siteDb.countJobs(id)
    // Always soft-archive; never hard-delete when jobs exist (and we don't hard-delete anyway).
    const updated = siteDb.update(id, {
      isActive: 0,
      archivedAt: nowIso(),
      archivedBy: actor.id ?? "System",
    })
    if (!updated) return { ok: false, error: "Failed to archive", jobCount }
    siteDb.logAudit({
      siteId: id,
      action: "archived",
      summary: `Site archived: ${site.name}${jobCount ? ` (${jobCount} linked jobs retained)` : ""}`,
      performedBy: actor.id ?? "System",
      performedByName: actor.name ?? "System",
    })
    return { ok: true, site: updated }
  },

  async restore(
    id: string,
    actor: { id?: string; name?: string } = {},
  ): Promise<SiteRow | null> {
    const updated = siteDb.update(id, {
      isActive: 1,
      archivedAt: null,
      archivedBy: null,
    })
    if (updated) {
      siteDb.logAudit({
        siteId: id,
        action: "restored",
        summary: `Site restored: ${updated.name}`,
        performedBy: actor.id ?? "System",
        performedByName: actor.name ?? "System",
      })
    }
    return updated
  },

  /** Hard delete only when zero linked jobs. */
  async delete(id: string): Promise<{ ok: true } | { ok: false; error: string; jobCount: number }> {
    const jobCount = siteDb.countJobs(id)
    if (jobCount > 0) {
      return {
        ok: false,
        error: "Cannot delete a site with linked jobs. Archive it instead.",
        jobCount,
      }
    }
    const { db } = await import("@/lib/db/connection")
    db.prepare("DELETE FROM SiteAuditEvent WHERE siteId = ?").run(id)
    db.prepare("DELETE FROM Site WHERE id = ?").run(id)
    return { ok: true }
  },

  async jobCounts(siteId: string): Promise<SiteJobCounts> {
    return siteDb.jobCounts(siteId)
  },

  async jobsForSite(siteId: string, limit = 50) {
    return siteDb.jobsForSite(siteId, limit)
  },

  async findLikelyDuplicates(opts: {
    clientId: string
    name: string
    addressLine1?: string | null
    postcode?: string | null
    excludeId?: string
  }): Promise<SiteSummary[]> {
    const candidates = siteDb.findLikelyDuplicates(opts)
    return candidates
      .filter(c => siteSimilarity(
        { name: opts.name, addressLine1: opts.addressLine1, postcode: opts.postcode },
        { name: c.name, addressLine1: c.addressLine1, postcode: c.postcode },
      ) >= 0.55)
      .map(r => ({ ...r, jobCounts: siteDb.jobCounts(r.id) }))
  },

  async assertSiteBelongsToClient(siteId: string, clientId: string): Promise<SiteRow | null> {
    const site = siteDb.findUnique(siteId)
    if (!site || site.clientId !== clientId) return null
    return site
  },

  formatAddress(site: SiteRow): string {
    return formatSiteAddress(site)
  },

  async logJobLinked(opts: {
    siteId: string
    jobId: string
    drawingNumber: string
    performedBy?: string
    performedByName?: string
  }): Promise<void> {
    const site = siteDb.findUnique(opts.siteId)
    siteDb.logAudit({
      siteId: opts.siteId,
      action: "job_linked",
      summary: `${opts.performedByName ?? "System"} linked ${opts.drawingNumber} to ${site?.name ?? "site"}`,
      jobId: opts.jobId,
      drawingNumber: opts.drawingNumber,
      performedBy: opts.performedBy,
      performedByName: opts.performedByName,
    })
  },

  async moveJob(opts: {
    jobId: string
    drawingNumber: string
    fromSiteId: string | null
    toSiteId: string
    performedBy?: string
    performedByName?: string
  }): Promise<SiteRow | null> {
    const toSite = siteDb.findUnique(opts.toSiteId)
    if (!toSite) return null
    const fromSite = opts.fromSiteId ? siteDb.findUnique(opts.fromSiteId) : null
    const displayAddress = formatSiteAddress(toSite)
    const { jobDb } = await import("@/lib/db/stores")
    jobDb.update(opts.jobId, {
      siteId: toSite.id,
      siteName: toSite.name,
      siteAddress: displayAddress || toSite.name,
      address: displayAddress || toSite.name,
      clientId: toSite.clientId,
      clientCompany: clientDb.findUnique(toSite.clientId)?.name ?? undefined,
      changedBy: opts.performedByName ?? "System",
    } as Parameters<typeof jobDb.update>[1])
    siteDb.logAudit({
      siteId: toSite.id,
      action: "job_moved",
      summary: `${opts.performedByName ?? "System"} moved ${opts.drawingNumber} from ${fromSite?.name ?? "unassigned"} to ${toSite.name}`,
      jobId: opts.jobId,
      drawingNumber: opts.drawingNumber,
      fromSiteId: opts.fromSiteId,
      performedBy: opts.performedBy,
      performedByName: opts.performedByName,
    })
    return toSite
  },

  async listAudit(siteId: string, limit = 50): Promise<SiteAuditEventRow[]> {
    return siteDb.listAudit(siteId, limit)
  },
}
