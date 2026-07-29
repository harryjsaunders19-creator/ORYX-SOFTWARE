/**
 * Job map service — Supabase PostgREST path for production / linked-project mode.
 * Loaded by the entry router (job-map-service.ts) when isSupabaseOnly() is true.
 */
import type { JobMapFilters, JobMapMarker, JobMapResponse } from "../types/job-map-types"
import type { MissingLocationJob, BulkGeocodeResult } from "../types/location-types"
import type { JobMapRow } from "../types/map-row"
import { jobService } from "@/modules/jobs/services/job-service"
import { createAdminClient } from "@/shared/supabase/admin"
import { isMissingColumnError } from "@/shared/supabase/archived-filter"
import { searchLocations } from "./geocode-service"
import { isWithinUkIreland } from "../constants"
import { compareMissingLocationQueue } from "../utils/job-address"
import { markersToCsv as buildMarkersCsv } from "../csv-export"
import {
  MAP_JOB_STATUS,
  GEOCODE_BATCH_SIZE,
  MAP_MARKER_LIMIT,
  toMarker,
  buildFilterOptions,
  computeStats,
  enrichMissingJob,
  geocodeJob,
} from "./job-map-service-shared"
import type { JobMapBbox } from "./job-map-service-shared"

const MAP_COLUMNS = "id, drawing_number, address, site_name, site_address, latitude, longitude, status, client_company, type_of_works, custom_type_description, designer, date_created, location_status, location_source"

const MAP_COLUMNS_MINIMAL = "id, drawing_number, address, latitude, longitude, status, client_company, type_of_works, custom_type_description, designer, date_created"

interface SupabaseMapRow {
  id: string
  drawing_number: string
  address: string
  site_name: string | null
  site_address: string | null
  latitude: number
  longitude: number
  status: string
  client_company: string
  type_of_works: string
  custom_type_description: string | null
  designer: string
  date_created: string
  location_status: string | null
  location_source: string | null
}

function isPlottableLocationStatus(status: string | null | undefined): boolean {
  return status == null || status === "mapped" || status === "manual"
}

function fromSupabaseRow(row: SupabaseMapRow): JobMapRow {
  return {
    id: row.id,
    drawingNumber: row.drawing_number,
    address: row.address,
    siteName: row.site_name,
    siteAddress: row.site_address,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    status: row.status,
    clientCompany: row.client_company,
    typeOfWorks: row.type_of_works,
    customTypeDescription: row.custom_type_description,
    designer: row.designer ?? "",
    dateCreated: row.date_created,
    locationStatus: row.location_status,
    locationSource: row.location_source,
  }
}

async function loadMappedRows(bbox?: JobMapBbox): Promise<JobMapRow[]> {
  let query = createAdminClient()
    .from("jobs")
    .select(MAP_COLUMNS)
    .eq("status", MAP_JOB_STATUS)
    .is("archived_at", null)
    .is("parent_job_id", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("date_created", { ascending: false })
    .limit(MAP_MARKER_LIMIT)

  if (bbox) {
    query = query
      .gte("latitude", bbox.south)
      .lte("latitude", bbox.north)
      .gte("longitude", bbox.west)
      .lte("longitude", bbox.east)
  }

  let { data, error } = await query

  if (error && (
    isMissingColumnError(error, "site_name")
    || isMissingColumnError(error, "location_status")
    || isMissingColumnError(error, "location_source")
  )) {
    let fallbackQuery = createAdminClient()
      .from("jobs")
      .select(MAP_COLUMNS_MINIMAL)
      .eq("status", MAP_JOB_STATUS)
      .is("archived_at", null)
      .is("parent_job_id", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("date_created", { ascending: false })
      .limit(MAP_MARKER_LIMIT)

    if (bbox) {
      fallbackQuery = fallbackQuery
        .gte("latitude", bbox.south)
        .lte("latitude", bbox.north)
        .gte("longitude", bbox.west)
        .lte("longitude", bbox.east)
    }

    const fallback = await fallbackQuery
    data = fallback.data as typeof data
    error = fallback.error
  }
  if (error) throw error

  return (data ?? [])
    .filter(r => isPlottableLocationStatus((r as SupabaseMapRow).location_status))
    .map(r => fromSupabaseRow({
      ...(r as SupabaseMapRow),
      site_name: (r as SupabaseMapRow).site_name ?? null,
      site_address: (r as SupabaseMapRow).site_address ?? null,
      location_status: (r as SupabaseMapRow).location_status ?? null,
      location_source: (r as SupabaseMapRow).location_source ?? null,
    }))
}

async function countMissingLocations(): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", MAP_JOB_STATUS)
    .is("archived_at", null)
    .is("parent_job_id", null)
    .or("latitude.is.null,longitude.is.null,location_status.eq.needs_review")

  if (error) throw error
  return count ?? 0
}

export const jobMapService = {
  searchLocations,

  async getMissingLocations(): Promise<MissingLocationJob[]> {
    const { data, error } = await createAdminClient()
      .from("jobs")
      .select("id, drawing_number, site_name, site_address, address, client_company, date_completed, location_status")
      .eq("status", MAP_JOB_STATUS)
      .is("archived_at", null)
      .is("parent_job_id", null)
      .or("latitude.is.null,longitude.is.null,location_status.eq.needs_review")
      .order("date_completed", { ascending: false })
      .limit(MAP_MARKER_LIMIT)

    if (error) throw error

    return (data ?? [])
      .map(row => enrichMissingJob({
        id: row.id as string,
        drawingNumber: row.drawing_number as string,
        siteName: row.site_name as string | null,
        siteAddress: row.site_address as string | null,
        address: row.address as string,
        clientCompany: row.client_company as string,
        dateCompleted: row.date_completed as string | null,
        locationStatus: row.location_status as string | null,
      }))
      .sort(compareMissingLocationQueue)
  },

  /** Admin-only — batch geocode completed jobs missing coordinates. */
  async geocodeBatch(limit = GEOCODE_BATCH_SIZE): Promise<BulkGeocodeResult> {
    const eligible = (await this.getMissingLocations())
      .filter(j => j.queueReason === "auto_ready")
      .slice(0, limit)

    const pending = eligible.map(j => ({
      id: j.id,
      address: j.siteAddress || j.address,
      siteName: j.siteName,
      siteAddress: j.siteAddress,
      locationStatus: j.locationStatus,
    }))

    let located = 0
    let needsReview = 0
    for (const job of pending) {
      if (await geocodeJob(job)) located++
      else needsReview++
    }

    const remaining = await this.countPendingGeocode()
    return {
      processed: pending.length,
      located,
      needsReview,
      pending: remaining,
    }
  },

  async retryGeocode(jobId: string): Promise<{ success: boolean }> {
    const job = await jobService.findUnique(jobId)
    if (!job) return { success: false }
    const ok = await geocodeJob({
      id: job.id,
      address: job.address,
      siteName: job.siteName,
      siteAddress: job.siteAddress,
      locationStatus: job.locationStatus ?? null,
    })
    return { success: ok }
  },

  async saveManualLocation(
    jobId: string,
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    if (!isWithinUkIreland(latitude, longitude)) return false
    const job = await jobService.saveManualLocation(jobId, latitude, longitude)
    return !!job
  },

  async countPendingGeocode(): Promise<number> {
    return countMissingLocations()
  },

  /** Read-only — returns only jobs that already have coordinates. Optional bbox for viewport loads. */
  async getMapData(filters: JobMapFilters & { bbox?: JobMapBbox } = {}): Promise<JobMapResponse> {
    const bbox = filters.bbox
    const [rows, missingLocations] = await Promise.all([
      loadMappedRows(bbox),
      countMissingLocations(),
    ])

    const markers = rows
      .map(toMarker)
      .filter(m => isWithinUkIreland(m.lat, m.lng))
      .slice(0, MAP_MARKER_LIMIT)

    const { clients, designers } = buildFilterOptions(rows)

    return {
      markers,
      stats: computeStats(markers, missingLocations),
      clients,
      designers,
      missingCoordinates: missingLocations,
      truncated: rows.length >= MAP_MARKER_LIMIT || markers.length >= MAP_MARKER_LIMIT,
    }
  },

  markersToCsv(markers: JobMapMarker[]): string {
    return buildMarkersCsv(markers)
  },
}
