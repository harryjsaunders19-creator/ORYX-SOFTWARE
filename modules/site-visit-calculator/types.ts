export interface SiteVisitRates {
  mileagePerMile: number
  hourlyRate: number
  vatRate: number
}

export interface SiteVisitRouteLeg {
  oneWayDistanceMiles: number
  oneWayDurationMinutes: number
}

export interface SiteVisitCalculationInput {
  siteAddress: string
  siteLat?: number | null
  siteLng?: number | null
  siteHours: number
  rates?: Partial<SiteVisitRates>
}

export interface SiteVisitCalculationResult {
  officeAddress: string
  siteAddress: string
  siteLat: number | null
  siteLng: number | null
  oneWayDistanceMiles: number
  returnDistanceMiles: number
  oneWayDurationMinutes: number
  returnDurationMinutes: number
  siteHours: number
  /** Billable one-way drive time (rounded up to half-hour steps). */
  returnBillableDriveHours: number
  /** On-site hours billed (minimum 1 hr). */
  billableSiteHours: number
  /** Total billable hours for labour at the hourly rate (half-hour steps). */
  billableLabourHours: number
  /** True when one-way drive exceeds 3.5 hr and the day rate applies. */
  isDayRate: boolean
  rates: SiteVisitRates
  mileageCost: number
  labourCost: number
  /** Mileage + labour before rounding to £95 intervals. */
  rawSubtotal: number
  subtotal: number
  vat: number
  grandTotal: number
}

export interface SavedSiteVisitCalculation {
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

export interface SaveSiteVisitInput {
  label?: string | null
  result: SiteVisitCalculationResult
}
