import type { ParentJobRow } from "../types/parent-job-types"
import { parseJobTags } from "@/lib/constants"

export interface SupabaseParentJobRow {
  id: string
  drawing_number: string
  client_id: string | null
  client_company: string
  site_id: string | null
  site_name: string | null
  site_address: string | null
  location_mode: string | null
  location_name: string | null
  postcode: string | null
  address: string
  type_of_works: string
  custom_type_description: string | null
  legacy_type_of_works: string | null
  description: string | null
  tags: string[] | null
  requested_by: string
  item_type: string
  archived_at: string | null
  archived_by: string | null
  latitude: number | null
  longitude: number | null
  geocoded_at: string | null
  geocoded_address: string | null
  location_status: string | null
  location_source: string | null
  legacy_job_id: string
  migrated_at: string
  created_at: string
  updated_at: string
}

export function toParentJobRow(row: SupabaseParentJobRow): ParentJobRow {
  return {
    id: row.id,
    drawingNumber: row.drawing_number,
    clientId: row.client_id,
    clientCompany: row.client_company,
    locationMode: row.site_id
      ? "MANAGED_SITE"
      : (row.location_mode === "MANAGED_SITE" ? "MANAGED_SITE" : "ONE_OFF"),
    siteId: row.site_id ?? null,
    locationName: row.location_name ?? row.site_name ?? null,
    postcode: row.postcode ?? null,
    siteName: row.site_name ?? row.location_name ?? null,
    siteAddress: row.site_address,
    address: row.address,
    typeOfWorks: row.type_of_works,
    customTypeDescription: row.custom_type_description,
    legacyTypeOfWorks: row.legacy_type_of_works,
    description: row.description,
    tags: parseJobTags(row.tags),
    requestedBy: row.requested_by,
    itemType: row.item_type,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    geocodedAt: row.geocoded_at,
    geocodedAddress: row.geocoded_address,
    locationStatus: row.location_status,
    locationSource: row.location_source,
    legacyJobId: row.legacy_job_id,
    migratedAt: row.migrated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toSupabaseParentJob(row: ParentJobRow): SupabaseParentJobRow {
  return {
    id: row.id,
    drawing_number: row.drawingNumber,
    client_id: row.clientId,
    client_company: row.clientCompany,
    site_id: row.siteId ?? null,
    site_name: row.siteName ?? row.locationName,
    site_address: row.siteAddress,
    location_mode: row.locationMode ?? (row.siteId ? "MANAGED_SITE" : "ONE_OFF"),
    location_name: row.locationName ?? row.siteName,
    postcode: row.postcode ?? null,
    address: row.address,
    type_of_works: row.typeOfWorks,
    custom_type_description: row.customTypeDescription,
    legacy_type_of_works: row.legacyTypeOfWorks,
    description: row.description,
    tags: row.tags ?? [],
    requested_by: row.requestedBy,
    item_type: row.itemType,
    archived_at: row.archivedAt,
    archived_by: row.archivedBy,
    latitude: row.latitude,
    longitude: row.longitude,
    geocoded_at: row.geocodedAt,
    geocoded_address: row.geocodedAddress,
    location_status: row.locationStatus,
    location_source: row.locationSource,
    legacy_job_id: row.legacyJobId,
    migrated_at: row.migratedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}
