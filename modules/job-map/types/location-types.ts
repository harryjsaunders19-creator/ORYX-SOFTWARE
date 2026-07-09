export const LOCATION_STATUSES = ["mapped", "needs_review", "manual"] as const
export type LocationStatus = (typeof LOCATION_STATUSES)[number]

export const LOCATION_SOURCES = ["geocoded", "manual"] as const
export type LocationSource = (typeof LOCATION_SOURCES)[number]

export type JobMapLocationFilter = "completed" | "missing" | "manual"

export interface MissingLocationJob {
  id: string
  drawingNumber: string
  siteName: string | null
  siteAddress: string | null
  address: string
  clientCompany: string
  dateCompleted: string | null
  locationStatus: LocationStatus | null
}

export interface BulkGeocodeResult {
  processed: number
  located: number
  needsReview: number
  pending: number
}
