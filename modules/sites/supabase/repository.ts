import { createAdminClient } from "@/shared/supabase/admin"
import { createId } from "@paralleldrive/cuid2"
import { nowIso } from "@/lib/db/helpers"
import { postgrestOrIlike, escapePostgrestFilterValue } from "@/shared/supabase/postgrest-filter"
import type {
  SiteRow,
  CreateSiteData,
  UpdateSiteData,
  SiteJobCounts,
  SiteAuditAction,
  SiteAuditEventRow,
} from "../types/site-types"
import {
  toSiteRow,
  toSupabaseInsert,
  toSupabaseUpdate,
  toSiteAuditRow,
  type SupabaseSiteRow,
  type SupabaseSiteAuditRow,
} from "./mapper"
import { formatSiteAddress, normalizeName, normalizePostcode } from "../lib/normalize"

const COLS = [
  "id", "client_id", "name", "name_lower",
  "address_line1", "address_line2", "city", "county", "postcode", "postcode_normalized", "country",
  "site_reference", "primary_contact_id", "notes",
  "is_active", "archived_at", "archived_by", "created_at", "updated_at",
].join(",")

function table() {
  return createAdminClient().from("sites")
}

function auditTable() {
  return createAdminClient().from("site_audit_events")
}

export const supabaseSiteRepo = {
  async findUnique(id: string): Promise<SiteRow | null> {
    const { data, error } = await table().select(COLS).eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toSiteRow(data as unknown as SupabaseSiteRow) : null
  },

  async findManyByIds(ids: string[]): Promise<SiteRow[]> {
    if (!ids.length) return []
    const { data, error } = await table().select(COLS).in("id", ids)
    if (error) throw error
    return ((data ?? []) as unknown as SupabaseSiteRow[]).map(toSiteRow)
  },

  async search(opts: {
    clientId: string
    q?: string
    activeOnly?: boolean
    includeArchived?: boolean
    limit?: number
  }): Promise<SiteRow[]> {
    let q = table().select(COLS).eq("client_id", opts.clientId).order("name", { ascending: true })
    if (!opts.includeArchived && opts.activeOnly !== false) {
      q = q.eq("is_active", true)
    }
    if (opts.q?.trim()) {
      const orFilter = postgrestOrIlike(
        ["name_lower", "address_line1", "address_line2", "city", "postcode", "site_reference"],
        opts.q,
      )
      if (orFilter) q = q.or(orFilter)
    }
    q = q.limit(opts.limit ?? 12)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as unknown as SupabaseSiteRow[]).map(toSiteRow)
  },

  async findByClient(
    clientId: string,
    opts: { activeOnly?: boolean; search?: string; take?: number } = {},
  ): Promise<SiteRow[]> {
    return this.search({
      clientId,
      q: opts.search,
      activeOnly: opts.activeOnly,
      limit: opts.take ?? 100,
    })
  },

  async create(data: CreateSiteData): Promise<SiteRow> {
    const now = nowIso()
    const row = toSupabaseInsert(data, now)
    const { data: inserted, error } = await table().insert(row).select(COLS).single()
    if (error) throw error
    return toSiteRow(inserted as unknown as SupabaseSiteRow)
  },

  async update(id: string, data: UpdateSiteData): Promise<SiteRow | null> {
    const patch = toSupabaseUpdate(data)
    if (!Object.keys(patch).length) return this.findUnique(id)
    patch.updated_at = nowIso()
    const { data: updated, error } = await table().update(patch).eq("id", id).select(COLS).maybeSingle()
    if (error) throw error
    if (!updated) return null

    const addressChanged =
      data.name !== undefined
      || data.addressLine1 !== undefined
      || data.addressLine2 !== undefined
      || data.city !== undefined
      || data.county !== undefined
      || data.postcode !== undefined
      || data.country !== undefined

    if (addressChanged) {
      const site = toSiteRow(updated as unknown as SupabaseSiteRow)
      const displayAddress = formatSiteAddress(site)
      const now = nowIso()
      await createAdminClient().from("jobs")
        .update({
          site_name: site.name,
          location_name: site.name,
          site_address: displayAddress || site.name,
          address: displayAddress || site.name,
          postcode: site.postcode,
          updated_at: now,
        })
        .eq("site_id", id)
        .is("parent_job_id", null)
      await createAdminClient().from("jobs")
        .update({
          site_name: site.name,
          location_name: site.name,
          site_address: displayAddress || site.name,
          postcode: site.postcode,
          updated_at: now,
        })
        .eq("site_id", id)
      await createAdminClient().from("parent_jobs")
        .update({
          site_name: site.name,
          location_name: site.name,
          site_address: displayAddress || site.name,
          address: displayAddress || site.name,
          postcode: site.postcode,
          updated_at: now,
        })
        .eq("site_id", id)
    }

    return toSiteRow(updated as unknown as SupabaseSiteRow)
  },

  async jobCounts(siteId: string): Promise<SiteJobCounts> {
    const admin = createAdminClient()
    const { count: total, error: tErr } = await admin.from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("parent_job_id", null)
      .is("archived_at", null)
    if (tErr) throw tErr
    const { count: completed, error: cErr } = await admin.from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("parent_job_id", null)
      .is("archived_at", null)
      .eq("status", "ISSUED")
    if (cErr) throw cErr
    const t = total ?? 0
    const c = completed ?? 0
    return { total: t, completed: c, active: Math.max(0, t - c) }
  },

  async jobsForSite(siteId: string, limit = 50) {
    const { data, error } = await createAdminClient().from("jobs")
      .select("id, drawing_number, site_name, site_address, address, client_company, status, type_of_works, designer, revision_letter, parent_job_id")
      .eq("site_id", siteId)
      .is("parent_job_id", null)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map(r => ({
      id: r.id as string,
      drawingNumber: r.drawing_number as string,
      siteName: (r.site_name as string | null) ?? null,
      siteAddress: (r.site_address as string | null) ?? null,
      address: r.address as string,
      clientCompany: r.client_company as string,
      status: r.status as string,
      typeOfWorks: r.type_of_works as string,
      designer: (r.designer as string) ?? "",
      revisionLetter: (r.revision_letter as string | null) ?? null,
      parentJobId: (r.parent_job_id as string | null) ?? null,
    }))
  },

  async countJobs(siteId: string): Promise<number> {
    const { count, error } = await createAdminClient().from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("site_id", siteId)
      .is("parent_job_id", null)
    if (error) throw error
    return count ?? 0
  },

  async findLikelyDuplicates(opts: {
    clientId: string
    name: string
    addressLine1?: string | null
    postcode?: string | null
    excludeId?: string
  }): Promise<SiteRow[]> {
    const nameLower = normalizeName(opts.name)
    const pc = normalizePostcode(opts.postcode)
    let q = table().select(COLS).eq("client_id", opts.clientId).eq("is_active", true).limit(8)
    const filters: string[] = [`name_lower.eq.${escapePostgrestFilterValue(nameLower)}`]
    if (pc) filters.push(`postcode_normalized.eq.${escapePostgrestFilterValue(pc)}`)
    if (opts.addressLine1?.trim()) {
      filters.push(`address_line1.ilike.${escapePostgrestFilterValue(opts.addressLine1.trim())}`)
    }
    q = q.or(filters.join(","))
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as unknown as SupabaseSiteRow[])
      .map(toSiteRow)
      .filter(r => r.id !== opts.excludeId)
  },

  async logAudit(opts: {
    siteId: string
    action: SiteAuditAction | string
    summary: string
    jobId?: string | null
    drawingNumber?: string | null
    fromSiteId?: string | null
    performedBy?: string
    performedByName?: string
    meta?: string | null
  }): Promise<SiteAuditEventRow> {
    const row = {
      id: createId(),
      site_id: opts.siteId,
      action: opts.action,
      summary: opts.summary,
      job_id: opts.jobId ?? null,
      drawing_number: opts.drawingNumber ?? null,
      from_site_id: opts.fromSiteId ?? null,
      performed_by: opts.performedBy ?? "System",
      performed_by_name: opts.performedByName ?? "System",
      performed_at: nowIso(),
      meta: opts.meta ? (() => { try { return JSON.parse(opts.meta!) } catch { return { raw: opts.meta } } })() : null,
    }
    const { data, error } = await auditTable().insert(row).select("*").single()
    if (error) throw error
    return toSiteAuditRow(data as SupabaseSiteAuditRow)
  },

  async listAudit(siteId: string, limit = 50): Promise<SiteAuditEventRow[]> {
    const { data, error } = await auditTable()
      .select("*")
      .eq("site_id", siteId)
      .order("performed_at", { ascending: false })
      .limit(limit)
    if (error) throw error
    return ((data ?? []) as SupabaseSiteAuditRow[]).map(toSiteAuditRow)
  },
}
