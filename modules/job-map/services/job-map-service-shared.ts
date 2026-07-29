/**
 * Shared constants and pure helpers for job-map-service-sqlite.ts and
 * job-map-service-supabase.ts. No DB access of any kind here.
 */
import type { JobMapBbox, JobMapMarker, JobMapResponse } from "../types/job-map-types"
import type { MissingLocationJob } from "../types/location-types"
import type { JobMapRow } from "../types/map-row"
import { jobService } from "@/modules/jobs/services/job-service"
import { geocodeAddress, geocodedAddressKey } from "./geocode-service"
import { getMapMarkerIconKey, jobDescriptionFromRow } from "../constants"
import { assessGeocodeInput } from "../utils/job-address"

export const MAP_JOB_STATUS = "ISSUED" as const

export const GEOCODE_BATCH_SIZE = 50

/** Cap map markers / missing-location queue size for browser + API payloads. */
export const MAP_MARKER_LIMIT = 3000

export function toMarker(row: JobMapRow): JobMapMarker {
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

export function buildFilterOptions(rows: JobMapRow[]) {
  const clients = [...new Set(rows.map(r => r.clientCompany))].sort()
  const designers = [...new Set(rows.map(r => r.designer).filter(Boolean))].sort()
  return { clients, designers }
}

export function computeStats(markers: JobMapMarker[], missingLocations: number): JobMapResponse["stats"] {
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

export function enrichMissingJob(
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

export async function geocodeJob(
  job: Pick<JobMapRow, "id" | "address" | "siteName" | "siteAddress" | "locationStatus">,
  options: { strict?: boolean } = {},
): Promise<boolean> {
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

/** Viewport bounds for map queries. Re-exported for convenience. */
export type { JobMapBbox }
