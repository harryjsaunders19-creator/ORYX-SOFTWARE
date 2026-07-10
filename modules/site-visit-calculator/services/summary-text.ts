import { formatGBP } from "@/shared/utils/utils"
import type { SiteVisitCalculationResult } from "../types"
import { DAY_RATE_DRIVE_THRESHOLD_HOURS } from "../constants"

function formatMiles(miles: number): string {
  return `${miles.toFixed(2)} mi`
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

function formatHours(hours: number): string {
  if (hours === 1) return "1 hour"
  return `${hours} hours`
}

export function buildSummaryText(result: SiteVisitCalculationResult): string {
  const labourLine = result.isDayRate
    ? `Labour (day rate): ${formatGBP(result.labourCost)}`
    : `Labour (${result.billableLabourHours} hr × ${formatGBP(result.rates.hourlyRate)}): ${formatGBP(result.labourCost)}`

  const lines = [
    "Site Visit Cost Estimate — ORYX Scaffold Design Ltd",
    "",
    `Office: ${result.officeAddress}`,
    `Site: ${result.siteAddress}`,
    "",
    `One-way distance: ${formatMiles(result.oneWayDistanceMiles)}`,
    `Return distance: ${formatMiles(result.returnDistanceMiles)}`,
    `One-way drive time: ${formatDuration(result.oneWayDurationMinutes)}`,
    `Return drive time: ${formatDuration(result.returnDurationMinutes)}`,
    `Time on site: ${formatHours(result.siteHours)}`,
    result.isDayRate
      ? `Day rate applied (one-way drive exceeds ${DAY_RATE_DRIVE_THRESHOLD_HOURS} hours)`
      : null,
    !result.isDayRate && result.billableSiteHours > result.siteHours
      ? `On-site time billed: ${formatHours(result.billableSiteHours)} (1 hr minimum)`
      : null,
    !result.isDayRate
      ? `Labour billed: ${formatHours(result.billableLabourHours)} @ ${formatGBP(result.rates.hourlyRate)}/hr`
      : null,
    "",
    `Mileage (${formatGBP(result.rates.mileagePerMile)}/mi × ${formatMiles(result.returnDistanceMiles)}): ${formatGBP(result.mileageCost)}`,
    labourLine,
    result.subtotal > result.rawSubtotal
      ? `Rounded to nearest ${formatGBP(result.rates.hourlyRate)} (ex VAT)`
      : null,
    "",
    `Total (ex VAT): ${formatGBP(result.subtotal)}`,
    `VAT (${Math.round(result.rates.vatRate * 100)}%): ${formatGBP(result.vat)}`,
    `Total (inc VAT): ${formatGBP(result.grandTotal)}`,
  ].filter((line): line is string => line != null)
  return lines.join("\n")
}
