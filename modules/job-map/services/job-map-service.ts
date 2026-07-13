/**

 * Job map — read-only fast path. Never geocodes on getMapData().

 */

import type { JobMapFilters, JobMapMarker, JobMapResponse } from "../types/job-map-types"

import type { MissingLocationJob, BulkGeocodeResult } from "../types/location-types"

import type { JobMapRow } from "../types/map-row"

import { jobDb } from "@/lib/db/stores/job"

import { jobService } from "@/modules/jobs/services/job-service"

import { useSupabaseJobs } from "@/lib/supabase/feature-flags"

import { createAdminClient } from "@/lib/supabase/admin"
import { isMissingColumnError } from "@/lib/supabase/archived-filter"

import { geocodeAddress, geocodedAddressKey, searchLocations } from "./geocode-service"

import { getMapMarkerIconKey, jobDescriptionFromRow, isWithinUkIreland } from "../constants"

import { assessGeocodeInput, compareMissingLocationQueue } from "../utils/job-address"

import { markersToCsv as buildMarkersCsv } from "../csv-export"



export const MAP_JOB_STATUS = "ISSUED" as const

export const GEOCODE_BATCH_SIZE = 50

/** Cap map markers / missing-location queue size for browser + API payloads. */
export const MAP_MARKER_LIMIT = 3000



const MAP_COLUMNS = "id, drawing_number, address, site_name, site_address, latitude, longitude, status, client_company, type_of_works, custom_type_description, designer, date_created, location_status, location_source"

const MAP_COLUMNS_MINIMAL = "id, drawing_number, address, latitude, longitude, status, client_company, type_of_works, custom_type_description, designer, date_created"

function isPlottableLocationStatus(status: string | null | undefined): boolean {
  return status == null || status === "mapped" || status === "manual"
}



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



function toMarker(row: JobMapRow): JobMapMarker {

  return {

    id: row.id,

    drawingNumber: row.drawingNumber,

    address: row.address,

    siteName: row.siteName,

    clientCompany: row.clientCompany,

    description: jobDescriptionFromRow(row),

    designer: row.designer || "—",

    dateCreated: row.dateCreated,

    typeOfWorks: row.typeOfWorks,

    lat: row.latitude,

    lng: row.longitude,

    iconKey: getMapMarkerIconKey(row.typeOfWorks),

    locationStatus: row.locationStatus,

    locationSource: row.locationSource,

  }

}



function enrichMissingJob(
  row: {
    id: string
    drawingNumber: string
    siteName: string | null
    siteAddress: string | null
    address: string
    clientCompany: string
    dateCompleted: string | null
    locationStatus: string | null
  },
): MissingLocationJob {
  const assessment = assessGeocodeInput(
    row.siteName,
    row.siteAddress,
    row.address,
    row.locationStatus,
  )
  return {
    id: row.id,
    drawingNumber: row.drawingNumber,
    siteName: row.siteName,
    siteAddress: row.siteAddress,
    address: row.address,
    clientCompany: row.clientCompany,
    dateCompleted: row.dateCompleted ?? null,
    locationStatus: row.locationStatus as MissingLocationJob["locationStatus"],
    queueReason: assessment.queueReason,
  }
}

async function loadMappedRows(): Promise<JobMapRow[]> {
  if (!useSupabaseJobs()) {
    return jobDb.findMappedForMap()
  }

  let { data, error } = await createAdminClient()
    .from("jobs")
    .select(MAP_COLUMNS)
    .eq("status", MAP_JOB_STATUS)
    .is("archived_at", null)
    .is("parent_job_id", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .order("date_created", { ascending: false })
    .limit(MAP_MARKER_LIMIT)

  if (error && (
    isMissingColumnError(error, "site_name")
    || isMissingColumnError(error, "location_status")
    || isMissingColumnError(error, "location_source")
  )) {
    const fallback = await createAdminClient()
      .from("jobs")
      .select(MAP_COLUMNS_MINIMAL)
      .eq("status", MAP_JOB_STATUS)
      .is("archived_at", null)
      .is("parent_job_id", null)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .order("date_created", { ascending: false })
      .limit(MAP_MARKER_LIMIT)
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

  if (!useSupabaseJobs()) {

    return jobDb.countMissingLocations()

  }

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



function buildFilterOptions(rows: JobMapRow[]) {

  const clients = [...new Set(rows.map(r => r.clientCompany))].sort()

  const designers = [...new Set(rows.map(r => r.designer).filter(Boolean))].sort()

  return { clients, designers }

}



function computeStats(markers: JobMapMarker[], missingLocations: number): JobMapResponse["stats"] {

  const year = new Date().getFullYear()

  const clients = new Set<string>()

  let thisYear = 0

  let manuallyLocated = 0

  for (const m of markers) {

    clients.add(m.clientCompany)

    if (m.dateCreated.slice(0, 4) === String(year)) thisYear++

    if (m.locationStatus === "manual") manuallyLocated++

  }

  return {

    total: markers.length,

    thisYear,

    active: markers.length,

    completed: markers.length,

    uniqueClients: clients.size,

    missingLocations,

    manuallyLocated,

  }

}



async function geocodeJob(
  job: Pick<JobMapRow, "id" | "address" | "siteName" | "siteAddress" | "locationStatus">,
  options: { strict?: boolean } = {},
): Promise<boolean> {
  // Supabase-only path: ensureJobInSqlite is a remote existence check (no /tmp populate).
  // Location writes go through jobService.saveGeocode / markLocationNeedsReview.
  if (!(await jobService.ensureJobInSqlite(job.id))) return false
  const assessment = assessGeocodeInput(
    job.siteName,
    job.siteAddress,
    job.address,
    job.locationStatus,
  )

  if (!assessment.query || !assessment.autoEligible) {
    await jobService.markLocationNeedsReview(job.id)
    return false
  }

  const result = await geocodeAddress(assessment.query, { strict: options.strict ?? true })

  if (!result) {
    await jobService.markLocationNeedsReview(job.id)
    return false
  }

  const key = geocodedAddressKey(assessment.query)
  await jobService.saveGeocode(job.id, result.lat, result.lng, key)
  return true
}



export const jobMapService = {

  searchLocations,



  async getMissingLocations(): Promise<MissingLocationJob[]> {
    if (!useSupabaseJobs()) {
      return jobDb.findMissingLocations()
        .map(enrichMissingJob)
        .sort(compareMissingLocationQueue)
    }

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

    const pending = useSupabaseJobs()
      ? eligible.map(j => ({
          id: j.id,
          address: j.siteAddress || j.address,
          siteName: j.siteName,
          siteAddress: j.siteAddress,
          locationStatus: j.locationStatus,
        }))
      : jobDb.findNeedingGeocode(limit).filter(job => {
          const assessment = assessGeocodeInput(job.siteName, job.siteAddress, job.address)
          return assessment.autoEligible
        })

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



  /** Read-only — returns only jobs that already have coordinates. */

  async getMapData(_filters: JobMapFilters = {}): Promise<JobMapResponse> {

    const [rows, missingLocations] = await Promise.all([

      loadMappedRows(),

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

    }

  },



  markersToCsv(markers: JobMapMarker[]): string {

    return buildMarkersCsv(markers)

  },

}

