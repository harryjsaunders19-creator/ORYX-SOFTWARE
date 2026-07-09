import type { JobStatusValue } from "@/lib/constants"
import type { JobMapLocationFilter } from "./location-types"

export type JobMapViewMode = "pins" | "heatmap"
export type JobMapTileMode = "street" | "satellite"

export interface JobMapFilters {
  search?: string
  client?: string
  designer?: string
  statuses?: JobStatusValue[]
  typeOfWorks?: string
  dateFrom?: string
  dateTo?: string
  highlightClient?: string
  locationFilter?: JobMapLocationFilter
}

export interface JobMapMarker {
  id: string
  drawingNumber: string
  address: string
  siteName: string | null
  clientCompany: string
  description: string
  designer: string
  dateCreated: string
  typeOfWorks: string
  lat: number
  lng: number
  iconKey: string
  locationStatus: string | null
  locationSource: string | null
}

export interface JobMapStats {
  total: number
  thisYear: number
  active: number
  completed: number
  uniqueClients: number
  missingLocations: number
  manuallyLocated: number
}

export interface JobMapResponse {
  markers: JobMapMarker[]
  stats: JobMapStats
  clients: string[]
  designers: string[]
  missingCoordinates: number
}
