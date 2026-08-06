/** Permanent design project record — one per drawing number. */

export interface ParentJobRow {
  id: string
  drawingNumber: string
  clientId: string | null
  clientCompany: string
  siteName: string | null
  siteAddress: string | null
  address: string
  typeOfWorks: string
  customTypeDescription: string | null
  legacyTypeOfWorks: string | null
  description: string | null
  /** Multi-select labels — presets from JOB_TAGS plus optional custom tags. */
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
