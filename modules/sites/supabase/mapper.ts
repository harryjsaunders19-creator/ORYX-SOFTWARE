import type { SiteRow, CreateSiteData, UpdateSiteData, SiteAuditEventRow } from "../types/site-types"
import { normalizeName, normalizePostcode } from "../lib/normalize"

export interface SupabaseSiteRow {
  id: string
  client_id: string
  name: string
  name_lower: string
  address_line1: string | null
  address_line2: string | null
  city: string | null
  county: string | null
  postcode: string | null
  postcode_normalized: string | null
  country: string | null
  site_reference: string | null
  primary_contact_id: string | null
  notes: string | null
  is_active: boolean
  archived_at: string | null
  archived_by: string | null
  created_at: string
  updated_at: string
}

export interface SupabaseSiteAuditRow {
  id: string
  site_id: string
  action: string
  summary: string
  job_id: string | null
  drawing_number: string | null
  from_site_id: string | null
  performed_by: string
  performed_by_name: string
  performed_at: string
  meta: unknown
}

export function toSiteRow(row: SupabaseSiteRow): SiteRow {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    nameLower: row.name_lower,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    county: row.county,
    postcode: row.postcode,
    postcodeNormalized: row.postcode_normalized,
    country: row.country,
    siteReference: row.site_reference,
    primaryContactId: row.primary_contact_id,
    notes: row.notes,
    isActive: row.is_active ? 1 : 0,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseInsert(data: CreateSiteData, now: string): Record<string, unknown> {
  const name = data.name.trim()
  const postcode = data.postcode?.trim() || null
  return {
    id: data.id,
    client_id: data.clientId,
    name,
    name_lower: normalizeName(name),
    address_line1: data.addressLine1?.trim() || null,
    address_line2: data.addressLine2?.trim() || null,
    city: data.city?.trim() || null,
    county: data.county?.trim() || null,
    postcode,
    postcode_normalized: postcode ? normalizePostcode(postcode) : null,
    country: data.country?.trim() || null,
    site_reference: data.siteReference?.trim() || null,
    primary_contact_id: data.primaryContactId || null,
    notes: data.notes?.trim() || null,
    is_active: true,
    archived_at: null,
    archived_by: null,
    created_at: now,
    updated_at: now,
  }
}

export function toSupabaseUpdate(data: UpdateSiteData): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) {
    patch.name = data.name.trim()
    patch.name_lower = normalizeName(data.name)
  }
  if (data.addressLine1 !== undefined) patch.address_line1 = data.addressLine1
  if (data.addressLine2 !== undefined) patch.address_line2 = data.addressLine2
  if (data.city !== undefined) patch.city = data.city
  if (data.county !== undefined) patch.county = data.county
  if (data.postcode !== undefined) {
    const postcode = data.postcode?.trim() || null
    patch.postcode = postcode
    patch.postcode_normalized = postcode ? normalizePostcode(postcode) : null
  }
  if (data.country !== undefined) patch.country = data.country
  if (data.siteReference !== undefined) patch.site_reference = data.siteReference
  if (data.primaryContactId !== undefined) patch.primary_contact_id = data.primaryContactId
  if (data.notes !== undefined) patch.notes = data.notes
  if (data.isActive !== undefined) patch.is_active = data.isActive === 1
  if (data.archivedAt !== undefined) patch.archived_at = data.archivedAt
  if (data.archivedBy !== undefined) patch.archived_by = data.archivedBy
  return patch
}

export function toSiteAuditRow(row: SupabaseSiteAuditRow): SiteAuditEventRow {
  return {
    id: row.id,
    siteId: row.site_id,
    action: row.action,
    summary: row.summary,
    jobId: row.job_id,
    drawingNumber: row.drawing_number,
    fromSiteId: row.from_site_id,
    performedBy: row.performed_by,
    performedByName: row.performed_by_name,
    performedAt: row.performed_at,
    meta: row.meta == null ? null : typeof row.meta === "string" ? row.meta : JSON.stringify(row.meta),
  }
}
