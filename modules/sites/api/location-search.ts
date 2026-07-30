/**
 * Unified location search for New Job — managed sites + prior job addresses.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService, formatSiteAddress } from "@/modules/sites"
import { isMissingSitesSchemaError, SITES_MIGRATION_HINT } from "@/modules/sites/lib/schema-errors"
import { normalizeAddressLine, normalizeName, normalizePostcode } from "@/modules/sites/lib/normalize"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { createAdminClient } from "@/shared/supabase/admin"
import { db } from "@/lib/db/connection"

export type LocationSearchHit =
  | {
      kind: "MANAGED_SITE"
      siteId: string
      locationName: string
      address: string
      postcode: string | null
      jobCount: number
    }
  | {
      kind: "JOB_LOCATION"
      siteId: string | null
      locationName: string
      address: string
      postcode: string | null
      jobCount: number
      sampleJobIds: string[]
      suggestManagedSite: boolean
    }

type JobLocRow = {
  id: string
  siteId: string | null
  locationName: string | null
  siteName: string | null
  siteAddress: string | null
  address: string
  postcode: string | null
}

function groupJobLocations(rows: JobLocRow[]): LocationSearchHit[] {
  const groups = new Map<string, {
    siteId: string | null
    locationName: string
    address: string
    postcode: string | null
    jobIds: string[]
  }>()

  for (const row of rows) {
    if (row.siteId) continue // covered by managed sites
    const name = (row.locationName || row.siteName || "").trim()
    const address = (row.siteAddress || row.address || "").trim()
    if (!name && !address) continue
    const key = [
      normalizePostcode(row.postcode),
      normalizeName(name),
      normalizeAddressLine(address),
    ].join("|")
    const existing = groups.get(key)
    if (existing) {
      existing.jobIds.push(row.id)
    } else {
      groups.set(key, {
        siteId: null,
        locationName: name || address.split(",")[0] || address,
        address: address || name,
        postcode: row.postcode,
        jobIds: [row.id],
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => b.jobIds.length - a.jobIds.length)
    .slice(0, 8)
    .map(g => ({
      kind: "JOB_LOCATION" as const,
      siteId: null,
      locationName: g.locationName,
      address: g.address,
      postcode: g.postcode,
      jobCount: g.jobIds.length,
      sampleJobIds: g.jobIds.slice(0, 5),
      suggestManagedSite: g.jobIds.length >= 2,
    }))
}

async function searchJobLocations(clientId: string, q: string): Promise<JobLocRow[]> {
  if (isSupabaseOnly()) {
    let query = createAdminClient()
      .from("jobs")
      .select("id, site_id, location_name, site_name, site_address, address, postcode")
      .eq("client_id", clientId)
      .is("parent_job_id", null)
      .is("archived_at", null)
      .limit(40)
    if (q.trim()) {
      const like = `%${q.trim()}%`
      query = query.or(
        [
          `location_name.ilike.${like}`,
          `site_name.ilike.${like}`,
          `site_address.ilike.${like}`,
          `address.ilike.${like}`,
          `postcode.ilike.${like}`,
        ].join(","),
      )
    }
    const { data, error } = await query
    if (error) {
      // Columns may not exist yet — fall back to classic fields.
      const fallback = await createAdminClient()
        .from("jobs")
        .select("id, site_id, site_name, site_address, address")
        .eq("client_id", clientId)
        .is("parent_job_id", null)
        .is("archived_at", null)
        .limit(40)
      if (fallback.error) throw fallback.error
      return (fallback.data ?? []).map(r => ({
        id: r.id as string,
        siteId: (r.site_id as string | null) ?? null,
        locationName: (r.site_name as string | null) ?? null,
        siteName: (r.site_name as string | null) ?? null,
        siteAddress: (r.site_address as string | null) ?? null,
        address: r.address as string,
        postcode: null,
      }))
    }
    return (data ?? []).map(r => ({
      id: r.id as string,
      siteId: (r.site_id as string | null) ?? null,
      locationName: (r.location_name as string | null) ?? null,
      siteName: (r.site_name as string | null) ?? null,
      siteAddress: (r.site_address as string | null) ?? null,
      address: r.address as string,
      postcode: (r.postcode as string | null) ?? null,
    }))
  }

  const like = `%${q.trim()}%`
  const rows = q.trim()
    ? db.prepare(`
        SELECT id, siteId, locationName, siteName, siteAddress, address, postcode
        FROM Job
        WHERE clientId = ? AND parentJobId IS NULL AND archivedAt IS NULL
          AND (
            IFNULL(locationName,'') LIKE ? OR IFNULL(siteName,'') LIKE ?
            OR IFNULL(siteAddress,'') LIKE ? OR IFNULL(address,'') LIKE ?
            OR IFNULL(postcode,'') LIKE ?
          )
        LIMIT 40
      `).all(clientId, like, like, like, like, like)
    : db.prepare(`
        SELECT id, siteId, locationName, siteName, siteAddress, address, postcode
        FROM Job
        WHERE clientId = ? AND parentJobId IS NULL AND archivedAt IS NULL
        ORDER BY createdAt DESC
        LIMIT 40
      `).all(clientId)

  return rows as JobLocRow[]
}

/** GET /api/locations/search?clientId=&q= */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const clientId = req.nextUrl.searchParams.get("clientId")
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 })
    }
    const q = req.nextUrl.searchParams.get("q") ?? ""

    let managedSites: LocationSearchHit[] = []
    try {
      const sites = await siteService.search({
        clientId,
        q,
        activeOnly: true,
        limit: 8,
      })
      managedSites = sites.map(s => ({
        kind: "MANAGED_SITE" as const,
        siteId: s.id,
        locationName: s.name,
        address: formatSiteAddress(s) || s.name,
        postcode: s.postcode,
        jobCount: s.jobCounts?.total ?? 0,
      }))
    } catch (err) {
      if (!isMissingSitesSchemaError(err)) throw err
      // Sites table missing — one-off search still works.
    }

    const jobLocs = groupJobLocations(await searchJobLocations(clientId, q))

    return NextResponse.json({
      results: [...managedSites, ...jobLocs],
      hint: managedSites.length === 0 && jobLocs.length === 0 && !q.trim()
        ? "Type an address, property or existing site"
        : undefined,
      sitesSchemaMissing: managedSites.length === 0 ? undefined : undefined,
      migrationHint: undefined as string | undefined,
    })
  } catch (err) {
    if (isMissingSitesSchemaError(err)) {
      return NextResponse.json({
        results: [],
        migrationHint: SITES_MIGRATION_HINT,
      })
    }
    return apiInternalError("locations.search", err)
  }
}
