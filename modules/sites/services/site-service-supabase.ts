/**
 * Sites — Supabase path when isSupabaseOnly().
 */
import { createId } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { createAdminClient } from "@/shared/supabase/admin"
import { supabaseSiteRepo } from "../supabase/repository"
import type {
  SiteRow,
  CreateSiteData,
  UpdateSiteData,
  SiteSummary,
  SiteJobCounts,
  SiteAuditEventRow,
} from "../types/site-types"
import { formatSiteAddress, siteSimilarity } from "../lib/normalize"

async function withCounts(rows: SiteRow[]): Promise<SiteSummary[]> {
  return Promise.all(rows.map(async r => ({
    ...r,
    jobCounts: await supabaseSiteRepo.jobCounts(r.id),
  })))
}

export const siteService = {
  async findUnique(id: string): Promise<SiteRow | null> {
    return supabaseSiteRepo.findUnique(id)
  },

  async findManyByIds(ids: string[]): Promise<SiteRow[]> {
    return supabaseSiteRepo.findManyByIds(ids)
  },

  async search(opts: {
    clientId: string
    q?: string
    activeOnly?: boolean
    includeArchived?: boolean
    limit?: number
  }): Promise<SiteSummary[]> {
    const rows = await supabaseSiteRepo.search(opts)
    return withCounts(rows)
  },

  async listForClient(
    clientId: string,
    opts: { activeOnly?: boolean; search?: string; take?: number } = {},
  ): Promise<SiteSummary[]> {
    const rows = await supabaseSiteRepo.findByClient(clientId, opts)
    const { data: client } = await createAdminClient()
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
    const withJobCounts = await withCounts(rows)
    return withJobCounts.map(r => ({ ...r, clientName: client?.name ?? null }))
  },

  async getSummary(id: string): Promise<SiteSummary | null> {
    const site = await supabaseSiteRepo.findUnique(id)
    if (!site) return null
    const { data: client } = await createAdminClient()
      .from("clients")
      .select("name")
      .eq("id", site.clientId)
      .maybeSingle()
    const jobCounts = await supabaseSiteRepo.jobCounts(id)
    return { ...site, clientName: client?.name ?? null, jobCounts }
  },

  async create(
    data: Omit<CreateSiteData, "id"> & { id?: string },
    actor: { id?: string; name?: string } = {},
  ): Promise<SiteRow> {
    const id = data.id ?? createId()
    const created = await supabaseSiteRepo.create({ ...data, id })
    await supabaseSiteRepo.logAudit({
      siteId: id,
      action: "created",
      summary: `Site created under client: ${created.name}`,
      performedBy: actor.id ?? "System",
      performedByName: actor.name ?? "System",
    })
    return created
  },

  async update(
    id: string,
    data: UpdateSiteData,
    actor: { id?: string; name?: string } = {},
  ): Promise<SiteRow | null> {
    const addressChanged =
      data.addressLine1 !== undefined
      || data.addressLine2 !== undefined
      || data.city !== undefined
      || data.county !== undefined
      || data.postcode !== undefined
      || data.country !== undefined
      || data.name !== undefined
    const updated = await supabaseSiteRepo.update(id, data)
    if (updated) {
      await supabaseSiteRepo.logAudit({
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
    const site = await supabaseSiteRepo.findUnique(id)
    if (!site) return { ok: false, error: "Site not found", jobCount: 0 }
    const jobCount = await supabaseSiteRepo.countJobs(id)
    const updated = await supabaseSiteRepo.update(id, {
      isActive: 0,
      archivedAt: nowIso(),
      archivedBy: actor.id ?? "System",
    })
    if (!updated) return { ok: false, error: "Failed to archive", jobCount }
    await supabaseSiteRepo.logAudit({
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
    const updated = await supabaseSiteRepo.update(id, {
      isActive: 1,
      archivedAt: null,
      archivedBy: null,
    })
    if (updated) {
      await supabaseSiteRepo.logAudit({
        siteId: id,
        action: "restored",
        summary: `Site restored: ${updated.name}`,
        performedBy: actor.id ?? "System",
        performedByName: actor.name ?? "System",
      })
    }
    return updated
  },

  async delete(id: string): Promise<{ ok: true } | { ok: false; error: string; jobCount: number }> {
    const jobCount = await supabaseSiteRepo.countJobs(id)
    if (jobCount > 0) {
      return {
        ok: false,
        error: "Cannot delete a site with linked jobs. Archive it instead.",
        jobCount,
      }
    }
    await createAdminClient().from("site_audit_events").delete().eq("site_id", id)
    const { error } = await createAdminClient().from("sites").delete().eq("id", id)
    if (error) throw error
    return { ok: true }
  },

  async jobCounts(siteId: string): Promise<SiteJobCounts> {
    return supabaseSiteRepo.jobCounts(siteId)
  },

  async jobsForSite(siteId: string, limit = 50) {
    return supabaseSiteRepo.jobsForSite(siteId, limit)
  },

  async findLikelyDuplicates(opts: {
    clientId: string
    name: string
    addressLine1?: string | null
    postcode?: string | null
    excludeId?: string
  }): Promise<SiteSummary[]> {
    const candidates = await supabaseSiteRepo.findLikelyDuplicates(opts)
    const filtered = candidates.filter(c => siteSimilarity(
      { name: opts.name, addressLine1: opts.addressLine1, postcode: opts.postcode },
      { name: c.name, addressLine1: c.addressLine1, postcode: c.postcode },
    ) >= 0.55)
    return withCounts(filtered)
  },

  async assertSiteBelongsToClient(siteId: string, clientId: string): Promise<SiteRow | null> {
    const site = await supabaseSiteRepo.findUnique(siteId)
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
    const site = await supabaseSiteRepo.findUnique(opts.siteId)
    await supabaseSiteRepo.logAudit({
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
    const toSite = await supabaseSiteRepo.findUnique(opts.toSiteId)
    if (!toSite) return null
    const fromSite = opts.fromSiteId ? await supabaseSiteRepo.findUnique(opts.fromSiteId) : null
    const displayAddress = formatSiteAddress(toSite)
    const { data: client } = await createAdminClient()
      .from("clients")
      .select("name")
      .eq("id", toSite.clientId)
      .maybeSingle()
    const now = nowIso()
    await createAdminClient().from("jobs").update({
      site_id: toSite.id,
      site_name: toSite.name,
      site_address: displayAddress || toSite.name,
      address: displayAddress || toSite.name,
      client_id: toSite.clientId,
      client_company: client?.name ?? undefined,
      updated_at: now,
    }).eq("id", opts.jobId)
    await createAdminClient().from("parent_jobs").update({
      site_id: toSite.id,
      site_name: toSite.name,
      site_address: displayAddress || toSite.name,
      address: displayAddress || toSite.name,
      client_id: toSite.clientId,
      client_company: client?.name ?? undefined,
      updated_at: now,
    }).eq("id", opts.jobId)
    await supabaseSiteRepo.logAudit({
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
    return supabaseSiteRepo.listAudit(siteId, limit)
  },
}
