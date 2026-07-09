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

import { geocodeAddress, geocodedAddressKey, searchLocations } from "./geocode-service"

import { getMapMarkerIconKey, jobDescriptionFromRow, isWithinUkIreland } from "../constants"

import { buildGeocodeQuery } from "../utils/job-address"

import { markersToCsv as buildMarkersCsv } from "../csv-export"



export const MAP_JOB_STATUS = "ISSUED" as const

export const GEOCODE_BATCH_SIZE = 50



const MAP_COLUMNS = "id, drawing_number, address, site_name, site_address, latitude, longitude, status, client_company, type_of_works, custom_type_description, designer, date_created, location_status, location_source"



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



async function loadMappedRows(): Promise<JobMapRow[]> {

  if (!useSupabaseJobs()) {

    return jobDb.findMappedForMap()

  }

  const { data, error } = await createAdminClient()

    .from("jobs")

    .select(MAP_COLUMNS)

    .eq("status", MAP_JOB_STATUS)

    .is("archived_at", null)

    .not("latitude", "is", null)

    .not("longitude", "is", null)
    .or("location_status.is.null,location_status.eq.mapped,location_status.eq.manual")
    .order("date_created", { ascending: false })

    .limit(15000)

  if (error) throw error

  return (data ?? []).map(r => fromSupabaseRow(r as SupabaseMapRow))

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

  job: Pick<JobMapRow, "id" | "address" | "siteName" | "siteAddress">,

): Promise<boolean> {

  const query = buildGeocodeQuery(job.siteName, job.siteAddress, job.address)

  if (!query) {

    await jobService.markLocationNeedsReview(job.id)

    return false

  }

  const result = await geocodeAddress(query)

  if (!result) {

    await jobService.markLocationNeedsReview(job.id)

    return false

  }

  const key = geocodedAddressKey(query)

  await jobService.saveGeocode(job.id, result.lat, result.lng, key)

  return true

}



export const jobMapService = {

  searchLocations,



  async getMissingLocations(): Promise<MissingLocationJob[]> {

    if (!useSupabaseJobs()) {

      return jobDb.findMissingLocations()

    }

    const { data, error } = await createAdminClient()

      .from("jobs")

      .select("id, drawing_number, site_name, site_address, address, client_company, date_completed, location_status")

      .eq("status", MAP_JOB_STATUS)

      .is("archived_at", null)

      .or("latitude.is.null,longitude.is.null,location_status.eq.needs_review")

      .order("date_completed", { ascending: false })

      .limit(5000)

    if (error) throw error

    return (data ?? []).map(row => ({

      id: row.id as string,

      drawingNumber: row.drawing_number as string,

      siteName: row.site_name as string | null,

      siteAddress: row.site_address as string | null,

      address: row.address as string,

      clientCompany: row.client_company as string,

      dateCompleted: row.date_completed as string | null,

      locationStatus: row.location_status as MissingLocationJob["locationStatus"],

    }))

  },



  /** Admin-only — batch geocode completed jobs missing coordinates. */

  async geocodeBatch(limit = GEOCODE_BATCH_SIZE): Promise<BulkGeocodeResult> {

    const pending = jobDb.findNeedingGeocode(limit)

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

    await jobService.ensureJobInSqlite(jobId)

    const job = jobDb.findUnique(jobId)

    if (!job) return { success: false }

    const ok = await geocodeJob(job)

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

