import { formatGBP } from "@/shared/utils/utils"
import type { SiteVisitCalculationResult } from "../types"

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
    result.billableSiteHours > result.siteHours
      ? `On-site time billed: ${formatHours(result.billableSiteHours)} (1 hr minimum)`
      : null,
    `Labour billed: ${formatHours(result.billableLabourHours)} @ ${formatGBP(result.rates.hourlyRate)}/hr`,
    "",
    `Mileage (${formatGBP(result.rates.mileagePerMile)}/mi × ${formatMiles(result.returnDistanceMiles)}): ${formatGBP(result.mileageCost)}`,
    `Labour (${result.billableLabourHours} hr × ${formatGBP(result.rates.hourlyRate)}): ${formatGBP(result.labourCost)}`,
    "",
    `Subtotal: ${formatGBP(result.subtotal)}`,
    `VAT (${Math.round(result.rates.vatRate * 100)}%): ${formatGBP(result.vat)}`,
    `Grand Total: ${formatGBP(result.grandTotal)}`,
  ].filter((line): line is string => line != null)
  return lines.join("\n")
}
