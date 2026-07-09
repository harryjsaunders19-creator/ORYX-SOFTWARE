/** Slim row returned by map-specific DB queries. */
export interface JobMapRow {
  id: string
  drawingNumber: string
  address: string
  siteName: string | null
  siteAddress: string | null
  latitude: number
  longitude: number
  status: string
  clientCompany: string
  typeOfWorks: string
  customTypeDescription: string | null
  designer: string
  dateCreated: string
  locationStatus: string | null
  locationSource: string | null
}
