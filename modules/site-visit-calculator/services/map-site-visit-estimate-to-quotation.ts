import { formatGBP } from "@/shared/utils/utils"
import { BILLING_INTERVAL } from "../constants"
import type { SiteVisitCalculationResult } from "../types"
import { DEFAULT_QUOTE_TERMS } from "@/modules/quotes/pdf/company"
import type { QuotationPdfData, QuotationPdfLineItem } from "@/modules/quotes/pdf/types"

export const SITE_VISIT_META_MARKER = "SITE_VISIT_CALCULATOR_V1"

export interface SiteVisitQuotationExportFields {
  clientCompany: string
  contactName?: string | null
  clientId?: string | null
  customerId?: string | null
  purchaseOrder?: string | null
  preparedBy: string
  /** Optional quotation label / reference shown only in notes when set. */
  quotationLabel?: string | null
  /** Optional client-facing description override (replaces generated narrative). */
  descriptionOverride?: string | null
  issueDate?: string | null
  validUntil?: string | null
  /** When true, quotation number is DRAFT and no permanent number is consumed. */
  draft?: boolean
  quotationNumber?: string
}

export interface SiteVisitCalculatorMeta {
  version: 1
  officeAddress: string
  destinationAddress: string
  oneWayDistanceMiles: number
  returnDistanceMiles: number
  oneWayDurationMinutes: number
  returnDurationMinutes: number
  timeOnSiteHours: number
  billableLabourHours: number
  billableSiteHours: number
  returnBillableDriveHours: number
  isDayRate: boolean
  hourlyRate: number
  mileageRate: number
  mileageCharge: number
  labourCharge: number
  roundingAdjustment: number
  rawSubtotal: number
  subtotalExVat: number
  vatRate: number
  vatAmount: number
  totalIncVat: number
  purchaseOrder?: string | null
  quotationLabel?: string | null
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} minutes`
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`
  return `${h} hour${h === 1 ? "" : "s"} ${m} minutes`
}

function formatHours(hours: number): string {
  if (hours === 1) return "1 hour"
  if (Number.isInteger(hours)) return `${hours} hours`
  return `${hours} hours`
}

function money(value: number): string {
  return formatGBP(value)
}

/** First line / short name from a formatted address for filenames. */
export function siteVisitSiteShortName(siteAddress: string): string {
  const first = siteAddress.split(/[,\n]/)[0]?.trim() || "Site"
  return first
}

export function sanitizePdfFilenamePart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "Site"
}

export function draftSiteVisitPdfFilename(siteAddress: string): string {
  const part = sanitizePdfFilenamePart(siteVisitSiteShortName(siteAddress))
  return `Site-Visit-Quotation-Draft-${part}.pdf`
}

export function buildSiteVisitNarrative(
  result: SiteVisitCalculationResult,
  override?: string | null,
): string {
  if (override?.trim()) return override.trim()
  const siteHoursLabel = formatHours(result.billableSiteHours)
  return (
    `Site visit to ${result.siteAddress}, including return travel from the ORYX office` +
    ` and ${siteHoursLabel} on site.`
  )
}

function labourDetailLines(result: SiteVisitCalculationResult): string[] {
  if (result.isDayRate) {
    return [`Day rate applied — ${money(result.labourCost)}`]
  }
  return [
    `${formatHours(result.billableLabourHours)} @ ${money(result.rates.hourlyRate)} per hour`,
  ]
}

function supportingDetailLines(result: SiteVisitCalculationResult): string[] {
  return [
    `Return distance: ${result.returnDistanceMiles.toFixed(2)} miles`,
    `Estimated return driving time: ${formatDuration(result.returnDurationMinutes)}`,
    `Time on site: ${formatHours(result.siteHours)}`,
    `Total labour billed: ${formatHours(result.billableLabourHours)}`,
  ]
}

export function buildSiteVisitQuoteLineItems(
  result: SiteVisitCalculationResult,
  options?: { descriptionOverride?: string | null; purchaseOrder?: string | null },
): QuotationPdfLineItem[] {
  const narrative = buildSiteVisitNarrative(result, options?.descriptionOverride)
  const roundingAdjustment = Math.round((result.subtotal - result.rawSubtotal) * 100) / 100

  const labourDesc = [
    "Site visit – labour",
    narrative,
    ...labourDetailLines(result),
    ...supportingDetailLines(result),
  ].join("\n")

  const mileageDesc = [
    "Return travel mileage",
    `${result.returnDistanceMiles.toFixed(2)} miles @ ${money(result.rates.mileagePerMile)} per mile`,
  ].join("\n")

  const items: QuotationPdfLineItem[] = [
    {
      description: labourDesc,
      amount: result.labourCost,
      vatApplicable: true,
      purchaseOrder: options?.purchaseOrder?.trim() || null,
    },
    {
      description: mileageDesc,
      amount: result.mileageCost,
      vatApplicable: true,
    },
  ]

  if (roundingAdjustment > 0) {
    items.push({
      description: [
        "Minimum / rounded site visit charge adjustment",
        `Rounded up to the nearest ${money(BILLING_INTERVAL)} billing interval`,
      ].join("\n"),
      amount: roundingAdjustment,
      vatApplicable: true,
    })
  }

  return items
}

export function buildSiteVisitCalculatorMeta(
  result: SiteVisitCalculationResult,
  extras?: { purchaseOrder?: string | null; quotationLabel?: string | null },
): SiteVisitCalculatorMeta {
  return {
    version: 1,
    officeAddress: result.officeAddress,
    destinationAddress: result.siteAddress,
    oneWayDistanceMiles: result.oneWayDistanceMiles,
    returnDistanceMiles: result.returnDistanceMiles,
    oneWayDurationMinutes: result.oneWayDurationMinutes,
    returnDurationMinutes: result.returnDurationMinutes,
    timeOnSiteHours: result.siteHours,
    billableLabourHours: result.billableLabourHours,
    billableSiteHours: result.billableSiteHours,
    returnBillableDriveHours: result.returnBillableDriveHours,
    isDayRate: result.isDayRate,
    hourlyRate: result.rates.hourlyRate,
    mileageRate: result.rates.mileagePerMile,
    mileageCharge: result.mileageCost,
    labourCharge: result.labourCost,
    roundingAdjustment: Math.round((result.subtotal - result.rawSubtotal) * 100) / 100,
    rawSubtotal: result.rawSubtotal,
    subtotalExVat: result.subtotal,
    vatRate: result.rates.vatRate,
    vatAmount: result.vat,
    totalIncVat: result.grandTotal,
    purchaseOrder: extras?.purchaseOrder?.trim() || null,
    quotationLabel: extras?.quotationLabel?.trim() || null,
  }
}

export function serializeSiteVisitMetaNotes(
  meta: SiteVisitCalculatorMeta,
  userNotes?: string | null,
): string {
  const block = `${SITE_VISIT_META_MARKER}\n${JSON.stringify(meta, null, 2)}`
  const extra = userNotes?.trim()
  return extra ? `${block}\n\n---\n${extra}` : block
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Map a site-visit calculator result (+ export fields) into the shared
 * quotation PDF model. Preview mode uses quotation number "DRAFT".
 */
export function mapSiteVisitEstimateToQuotationData(
  result: SiteVisitCalculationResult,
  fields: SiteVisitQuotationExportFields,
): QuotationPdfData {
  const draft = fields.draft !== false && !fields.quotationNumber
  const issueDate = fields.issueDate ?? todayIso()
  const validUntil = fields.validUntil ?? addDaysIso(issueDate, 30)
  const vatRatePercent = Math.round(result.rates.vatRate * 10000) / 100
  const items = buildSiteVisitQuoteLineItems(result, {
    descriptionOverride: fields.descriptionOverride,
    purchaseOrder: fields.purchaseOrder,
  })

  const itemsSum = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100
  // Prefer calculator totals; items are constructed to sum to subtotal.
  const subtotal = result.subtotal
  if (Math.abs(itemsSum - subtotal) > 0.01) {
    throw new Error("Site visit line items do not match calculator subtotal")
  }

  const labelNote = fields.quotationLabel?.trim()
    ? `Reference: ${fields.quotationLabel.trim()}`
    : null

  return {
    quotationNumber: fields.quotationNumber?.trim() || (draft ? "DRAFT" : "DRAFT"),
    issueDate,
    validUntil,
    preparedBy: fields.preparedBy.trim() || "ORYX",
    customerId: fields.customerId ?? null,
    client: fields.clientCompany.trim(),
    contact: fields.contactName?.trim() || null,
    site: result.siteAddress,
    purchaseOrder: fields.purchaseOrder?.trim() || null,
    items,
    subtotal,
    taxable: subtotal,
    vatRate: vatRatePercent,
    vatAmount: result.vat,
    grandTotal: result.grandTotal,
    notes: labelNote,
    terms: [...DEFAULT_QUOTE_TERMS],
    filename: draft
      ? draftSiteVisitPdfFilename(result.siteAddress)
      : undefined,
  }
}

export function validateSiteVisitResultForExport(
  result: SiteVisitCalculationResult | null | undefined,
): string | null {
  if (!result) return "Calculate a site visit before exporting"
  if (!result.siteAddress?.trim()) return "Select a valid destination"
  if (!Number.isFinite(result.returnDistanceMiles) || result.returnDistanceMiles < 0) {
    return "Calculation is incomplete — distance missing"
  }
  if (!Number.isFinite(result.billableLabourHours) || result.billableLabourHours <= 0) {
    return "Calculation is incomplete — labour hours missing"
  }
  if (!Number.isFinite(result.subtotal) || result.subtotal < 0) {
    return "Calculation totals are invalid"
  }
  if (!Number.isFinite(result.vat) || !Number.isFinite(result.grandTotal)) {
    return "Calculation totals are invalid"
  }
  if (result.grandTotal < result.subtotal) {
    return "Calculation totals are invalid"
  }
  return null
}
