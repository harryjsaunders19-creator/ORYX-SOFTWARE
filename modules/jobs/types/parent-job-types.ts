/** Permanent design project record — one per drawing number. */

export interface ParentJobRow {
  id: string
  drawingNumber: string
  clientId: string | null
  clientCompany: string
  locationMode: "ONE_OFF" | "MANAGED_SITE"
  siteId: string | null
  locationName: string | null
  postcode: string | null
  siteName: string | null
  siteAddress: string | null
  address: string
  typeOfWorks: string
  customTypeDescription: string | null
  legacyTypeOfWorks: string | null
  description: string | null
  /** Controlled multi-select labels from JOB_TAGS. */
  tags: string[]
  requestedBy: string
  itemType: string
  archivedAt: string | null
  archivedBy: string | null
  latitude: number | null
  longitude: number | null
  geocodedAt: string | null
  geocodedAddress: string | null
  locationStatus: string | null
  locationSource: string | null
  legacyJobId: string
  migratedAt: string
  createdAt: string
  updatedAt: string
}
