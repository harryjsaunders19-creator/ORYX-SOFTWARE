import {
  DEFAULT_HOURLY_RATE,
  DEFAULT_MILEAGE_RATE,
  DEFAULT_VAT_RATE,
  MAX_SITE_HOURS,
  MIN_BILLABLE_SITE_HOURS,
  MIN_SITE_HOURS,
} from "../constants"
import type {
  SiteVisitCalculationInput,
  SiteVisitCalculationResult,
  SiteVisitRates,
  SiteVisitRouteLeg,
} from "../types"

export function resolveRates(partial?: Partial<SiteVisitRates>): SiteVisitRates {
  return {
    mileagePerMile: partial?.mileagePerMile ?? DEFAULT_MILEAGE_RATE,
    hourlyRate: partial?.hourlyRate ?? DEFAULT_HOURLY_RATE,
    vatRate: partial?.vatRate ?? DEFAULT_VAT_RATE,
  }
}

export function validateSiteHours(hours: number): string | null {
  if (!Number.isFinite(hours)) return "Time on site must be a number"
  if (hours < MIN_SITE_HOURS) return `Time on site must be at least ${MIN_SITE_HOURS} hour`
  if (hours > MAX_SITE_HOURS) return `Time on site cannot exceed ${MAX_SITE_HOURS} hours`
  const halfSteps = hours * 2
  if (Math.abs(halfSteps - Math.round(halfSteps)) > 0.001) {
    return "Time on site must be in half-hour increments"
  }
  return null
}

export function milesFromMetres(metres: number): number {
  return Math.round((metres / 1609.344) * 100) / 100
}

export function minutesFromSeconds(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

/** Round drive duration up to the nearest half hour (45 min → 1 hr, 1 hr 15 → 1.5 hr). */
export function roundUpDriveMinutesToHours(minutes: number): number {
  if (minutes <= 0) return 0
  return Math.ceil(minutes / 30) / 2
}

/**
 * Labour billing:
 * - Each one-way drive leg rounds up to half-hour steps
 * - Return driving = 2 × one-way billable hours
 * - On-site time has a 1 hr minimum charge
 */
export function computeBillableLabourHours(
  oneWayDurationMinutes: number,
  siteHours: number,
): {
  oneWayBillableHours: number
  returnBillableDriveHours: number
  billableSiteHours: number
  billableLabourHours: number
} {
  const oneWayBillableHours = roundUpDriveMinutesToHours(oneWayDurationMinutes)
  const returnBillableDriveHours = oneWayBillableHours * 2
  const billableSiteHours = Math.max(siteHours, MIN_BILLABLE_SITE_HOURS)
  const billableLabourHours = returnBillableDriveHours + billableSiteHours
  return {
    oneWayBillableHours,
    returnBillableDriveHours,
    billableSiteHours,
    billableLabourHours,
  }
}

/** Office → site → office: double one-way distance and driving time. */
export function buildCalculationResult(params: {
  officeAddress: string
  siteAddress: string
  siteLat: number | null
  siteLng: number | null
  siteHours: number
  route: SiteVisitRouteLeg
  rates?: Partial<SiteVisitRates>
}): SiteVisitCalculationResult {
  const rates = resolveRates(params.rates)
  const returnDistanceMiles = roundMoney(params.route.oneWayDistanceMiles * 2)
  const returnDurationMinutes = roundMoney(params.route.oneWayDurationMinutes * 2)

  const billing = computeBillableLabourHours(
    params.route.oneWayDurationMinutes,
    params.siteHours,
  )

  const mileageCost = roundMoney(returnDistanceMiles * rates.mileagePerMile)
  const labourCost = roundMoney(billing.billableLabourHours * rates.hourlyRate)
  const subtotal = roundMoney(mileageCost + labourCost)
  const vat = roundMoney(subtotal * rates.vatRate)
  const grandTotal = roundMoney(subtotal + vat)

  return {
    officeAddress: params.officeAddress,
    siteAddress: params.siteAddress,
    siteLat: params.siteLat,
    siteLng: params.siteLng,
    oneWayDistanceMiles: params.route.oneWayDistanceMiles,
    returnDistanceMiles,
    oneWayDurationMinutes: params.route.oneWayDurationMinutes,
    returnDurationMinutes,
    siteHours: params.siteHours,
    returnBillableDriveHours: billing.returnBillableDriveHours,
    billableSiteHours: billing.billableSiteHours,
    billableLabourHours: billing.billableLabourHours,
    rates,
    mileageCost,
    labourCost,
    subtotal,
    vat,
    grandTotal,
  }
}

export function calculateFromRoute(
  input: SiteVisitCalculationInput,
  route: SiteVisitRouteLeg,
  officeAddress: string,
): SiteVisitCalculationResult {
  return buildCalculationResult({
    officeAddress,
    siteAddress: input.siteAddress.trim(),
    siteLat: input.siteLat ?? null,
    siteLng: input.siteLng ?? null,
    siteHours: input.siteHours,
    route,
    rates: input.rates,
  })
}
