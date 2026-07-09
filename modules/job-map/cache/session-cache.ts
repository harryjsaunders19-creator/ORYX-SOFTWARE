import type { JobMapMarker, JobMapResponse } from "../types/job-map-types"
import type { JobMapLocationFilter } from "../types/location-types"

const CACHE_KEY = "oryx-job-map-cache-v2"

let memoryCache: JobMapResponse | null = null

export function getJobMapCache(): JobMapResponse | null {
  if (memoryCache) return memoryCache
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as JobMapResponse
    memoryCache = parsed
    return parsed
  } catch {
    return null
  }
}

export function setJobMapCache(data: JobMapResponse): void {
  memoryCache = data
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch { /* quota — memory cache still works */ }
}

export function clearJobMapCache(): void {
  memoryCache = null
  if (typeof window === "undefined") return
  try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

/** Client-side filter — instant, no API round-trip. */
export function filterMarkers(
  markers: JobMapMarker[],
  filters: {
    search?: string
    client?: string
    designer?: string
    typeOfWorks?: string
    dateFrom?: string
    dateTo?: string
    highlightClient?: string
    locationFilter?: JobMapLocationFilter
  },
): JobMapMarker[] {
  const q = filters.search?.trim().toLowerCase()
  return markers.filter(m => {
    if (filters.locationFilter === "manual" && m.locationStatus !== "manual") return false
    if (q) {
      const hay = `${m.drawingNumber} ${m.address} ${m.siteName ?? ""} ${m.clientCompany}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.client && m.clientCompany !== filters.client) return false
    if (filters.designer && m.designer !== filters.designer) return false
    if (filters.typeOfWorks && m.typeOfWorks !== filters.typeOfWorks) return false
    if (filters.dateFrom && m.dateCreated.slice(0, 10) < filters.dateFrom) return false
    if (filters.dateTo && m.dateCreated.slice(0, 10) > filters.dateTo) return false
    if (filters.highlightClient && m.clientCompany !== filters.highlightClient) return false
    return true
  })
}

export function computeFilteredStats(
  markers: JobMapMarker[],
  missingLocations = 0,
): JobMapResponse["stats"] {
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
