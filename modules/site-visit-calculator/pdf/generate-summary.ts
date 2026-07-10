import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { ORYX_OFFICE, DAY_RATE_DRIVE_THRESHOLD_HOURS } from "../constants"
import type { SiteVisitCalculationResult } from "../types"
import { buildSummaryText } from "../services/summary-text"
import { formatGBP } from "@/shared/utils/utils"

const MARGIN = 50
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89

function fmtMiles(m: number): string {
  return `${m.toFixed(2)} mi`
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

export async function buildSiteVisitPdfBuffer(
  result: SiteVisitCalculationResult,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

  let y = PAGE_HEIGHT - MARGIN

  const draw = (text: string, size: number, bold = false) => {
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0, 0, 0),
    })
    y -= size + 6
  }

  draw("Site Visit Cost Estimate", 16, true)
  draw(ORYX_OFFICE.name, 11, true)
  y -= 4
  draw(`Office: ${result.officeAddress}`, 10)
  draw(`Site: ${result.siteAddress}`, 10)
  y -= 8

  const rows: [string, string][] = [
    ["One-way distance", fmtMiles(result.oneWayDistanceMiles)],
    ["Return distance", fmtMiles(result.returnDistanceMiles)],
    ["One-way drive time", fmtDuration(result.oneWayDurationMinutes)],
    ["Return drive time", fmtDuration(result.returnDurationMinutes)],
    ["Time on site", `${result.siteHours} hr`],
    result.isDayRate
      ? ["Labour", `Day rate ${formatGBP(result.labourCost)} (>${DAY_RATE_DRIVE_THRESHOLD_HOURS} hr drive)`]
      : ["Labour billed", `${result.billableLabourHours} hr @ ${formatGBP(result.rates.hourlyRate)}/hr`],
    ["", ""],
    ["Mileage cost", formatGBP(result.mileageCost)],
    result.isDayRate
      ? ["Labour cost", formatGBP(result.labourCost)]
      : ["Labour cost", `${formatGBP(result.labourCost)} (${result.billableLabourHours} hr)`],
    ["Total (ex VAT)", formatGBP(result.subtotal)],
    [`VAT (${Math.round(result.rates.vatRate * 100)}%)`, formatGBP(result.vat)],
    ["Total (inc VAT)", formatGBP(result.grandTotal)],
  ]

  for (const [label, value] of rows) {
    if (!label && !value) { y -= 4; continue }
    const isTotal = label === "Total (ex VAT)" || label === "Total (inc VAT)"
    const rowFont = isTotal ? fontBold : font
    page.drawText(label, { x: MARGIN, y, size: isTotal ? 11 : 10, font: rowFont })
    page.drawText(value, {
      x: PAGE_WIDTH - MARGIN - rowFont.widthOfTextAtSize(value, isTotal ? 11 : 10),
      y,
      size: isTotal ? 11 : 10,
      font: rowFont,
    })
    y -= 16
  }

  y -= 12
  const note = buildSummaryText(result).split("\n").slice(-3).join("  ")
  page.drawText(note, { x: MARGIN, y, size: 8, font, color: rgb(0.4, 0.4, 0.4) })

  return doc.save()
}
