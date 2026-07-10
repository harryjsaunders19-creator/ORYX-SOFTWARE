import {
  DEFAULT_HOURLY_RATE,
  DEFAULT_MILEAGE_RATE,
  DEFAULT_VAT_RATE,
  MAX_SITE_HOURS,
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
  const returnDriveHours = returnDurationMinutes / 60

  const mileageCost = roundMoney(returnDistanceMiles * rates.mileagePerMile)
  const labourCost = roundMoney((returnDriveHours + params.siteHours) * rates.hourlyRate)
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
