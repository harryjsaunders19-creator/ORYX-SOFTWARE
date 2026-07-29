/**
 * Job map service — SQLite path for local/CI when Supabase admin is not configured.
 * Loaded by the entry router (job-map-service.ts) when isSupabaseOnly() is false.
 */
import type { JobMapFilters, JobMapMarker, JobMapResponse } from "../types/job-map-types"
import type { MissingLocationJob, BulkGeocodeResult } from "../types/location-types"
import type { JobMapRow } from "../types/map-row"
import { jobDb } from "@/lib/db/stores/job"
import { jobService } from "@/modules/jobs/services/job-service"
import { searchLocations } from "./geocode-service"
import { isWithinUkIreland } from "../constants"
import { assessGeocodeInput, compareMissingLocationQueue } from "../utils/job-address"
import { markersToCsv as buildMarkersCsv } from "../csv-export"
import {
  GEOCODE_BATCH_SIZE,
  MAP_MARKER_LIMIT,
  toMarker,
  buildFilterOptions,
  computeStats,
  enrichMissingJob,
  geocodeJob,
} from "./job-map-service-shared"
import type { JobMapBbox } from "./job-map-service-shared"

async function loadMappedRows(bbox?: JobMapBbox): Promise<JobMapRow[]> {
  return jobDb.findMappedForMap(bbox)
}

async function countMissingLocations(): Promise<number> {
  return jobDb.countMissingLocations()
}

export const jobMapService = {
  searchLocations,

  async getMissingLocations(): Promise<MissingLocationJob[]> {
    return jobDb.findMissingLocations()
      .map(enrichMissingJob)
      .sort(compareMissingLocationQueue)
  },

  /** Admin-only — batch geocode completed jobs missing coordinates. */
  async geocodeBatch(limit = GEOCODE_BATCH_SIZE): Promise<BulkGeocodeResult> {
    const pending = jobDb.findNeedingGeocode(limit).filter(job => {
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
