export interface SiteVisitCalculationRow {
  id: string
  label: string | null
  createdBy: string
  createdByName: string | null
  siteAddress: string
  siteLat: number | null
  siteLng: number | null
  oneWayDistanceMiles: number
  oneWayDurationMinutes: number
  siteHours: number
  mileageRate: number
  hourlyRate: number
  vatRate: number
  mileageCost: number
  labourCost: number
  subtotal: number
  vat: number
  grandTotal: number
  createdAt: string
  updatedAt: string
}

export interface CreateSiteVisitCalculationData {
  id: string
  label: string | null
  createdBy: string
  createdByName: string | null
  siteAddress: string
  siteLat: number | null
  siteLng: number | null
  oneWayDistanceMiles: number
  oneWayDurationMinutes: number
  siteHours: number
  mileageRate: number
  hourlyRate: number
  vatRate: number
  mileageCost: number
  labourCost: number
  subtotal: number
  vat: number
  grandTotal: number
}
