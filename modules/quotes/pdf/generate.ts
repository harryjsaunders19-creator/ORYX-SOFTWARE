/**
 * Quote PDF generation — extracted from the API route so it can run
 * in the background via next/server `after()`.
 */
import { quoteService } from "../services/quote-service"
import { clientService } from "@/modules/clients"
import { quotePdfDownloadUrl } from "./urls"
import { setCachedQuotePdf } from "./cache"
import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { format } from "date-fns"
import fs from "fs/promises"
import path from "path"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_L    = 43.7
const MARGIN_R    = 551.2
const CONTENT_W   = MARGIN_R - MARGIN_L

// ── Monochrome palette ────────────────────────────────────────────────────────
const INK      = rgb(0.051, 0.051, 0.051)   // #0D0D0D  near-black body text
const CHARCOAL = rgb(0.165, 0.165, 0.165)   // #2A2A2A  table header background
const WHITE    = rgb(1, 1, 1)
const RULE_C   = rgb(0.784, 0.784, 0.784)   // #C8C8C8  0.5pt separator lines
const ROW_ALT  = rgb(0.961, 0.961, 0.961)   // #F5F5F5  alternating row tint
const TOTAL_BG = rgb(0.914, 0.914, 0.914)   // #E9E9E9  total row background
const LABEL_C  = rgb(0.424, 0.424, 0.424)   // #6C6C6C  muted labels / captions

// ── Company data ──────────────────────────────────────────────────────────────
const COMPANY = {
  name: "ORYX Scaffold Design Ltd",
  addressLines: ["Little Woodlands, 61 Bath Road, Willsbridge.", "Bristol, BS30 6ES."],
  phone: "0117 3290050",
  email: "harry@oryxdesignltd.co.uk",
}

const TERMS = [
  "Customer will be billed after indicating acceptance of this quote.",
  "Payment will be due 21 days after the receipt of invoice.",
  "Please confirm acceptance of this quote in written form through email.",
  "Any further works or revisions after the submittal of the first design will be charged at £95.00 + VAT Per hour.",
]

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  try { return format(new Date(d), "dd/MM/yyyy") } catch { return d }
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = text.split(/\n/)
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(""); continue }
    let current = ""
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word
      if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
        lines.push(current)
        current = word
      } else {
        current = trial
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

export async function buildQuotePdfBuffer(id: string): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  const quote = await quoteService.findUnique(id)
  if (!quote) throw new Error("Quote not found")

  const preparedBy = quote.createdBy

  const [client, realLineItems] = await Promise.all([
    quote.clientId ? clientService.findUnique(quote.clientId) : Promise.resolve(null),
    quoteService.findLineItemsForQuote(quote.id),
  ])
  const customerId = client?.accountCode ?? null
  const lineItems = realLineItems.length
    ? realLineItems.map(li => ({ description: li.description, amount: li.amount, vatApplicable: li.vatApplicable === 1 }))
    : [{ description: quote.description, amount: quote.quoteValue, vatApplicable: true }]

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
  const taxable  = lineItems.filter(li => li.vatApplicable).reduce((sum, li) => sum + li.amount, 0)
  const vatDue   = quote.vatRate != null ? taxable * (quote.vatRate / 100) : 0
  const total    = quote.vatRate != null ? subtotal + vatDue : subtotal

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  const [regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf")),
  ])
  const fontRegular = await doc.embedFont(regularBytes)
  const fontBold    = await doc.embedFont(boldBytes)

  const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
  const logoImage = await doc.embedJpg(logoBytes)

  // ── Drawing helpers ────────────────────────────────────────────────────────

  const drawText = (
    text: string,
    x: number,
    baselineY: number,
    opts: {
      size: number
      bold?: boolean
      color?: ReturnType<typeof rgb>
      align?: "left" | "right" | "center"
      maxWidth?: number
    }
  ) => {
    const font = opts.bold ? fontBold : fontRegular
    let drawX = x
    if (opts.align === "right") {
      drawX = x - font.widthOfTextAtSize(text, opts.size)
    } else if (opts.align === "center" && opts.maxWidth != null) {
      drawX = x + (opts.maxWidth - font.widthOfTextAtSize(text, opts.size)) / 2
    }
    page.drawText(text, { x: drawX, y: baselineY, size: opts.size, font, color: opts.color ?? INK })
  }

  function drawHRule(y: number, x1 = MARGIN_L, x2 = MARGIN_R) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: RULE_C })
  }

  /** Uppercase label + thin rule 5pt below its baseline. */
  function drawSectionHeading(label: string, x: number, topY: number, colWidth: number) {
    drawText(label, x, topY, { size: 9, bold: true })
    page.drawLine({ start: { x, y: topY - 5 }, end: { x: x + colWidth, y: topY - 5 }, thickness: 0.5, color: RULE_C })
  }

  function truncateToWidth(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
    let result = text
    while (result.length > 1 && font.widthOfTextAtSize(result + "…", size) > maxWidth) {
      result = result.slice(0, -1)
    }
    return result + "…"
  }

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Logo (real brand asset)
  page.drawImage(logoImage, { x: 52.2, y: 748.29, width: 92.8, height: 56.9 })

  // Company name — 22pt bold
  const coTextX = 155
  drawText(COMPANY.name, coTextX, 781, { size: 22, bold: true })

  // Company details — 8pt muted
  const details = [
    COMPANY.addressLines[0],
    COMPANY.addressLines[1],
    `T: ${COMPANY.phone}`,
    `Prepared by: ${preparedBy}`,
  ]
  details.forEach((line, i) => {
    drawText(line, coTextX, 765 - i * 12, { size: 8, color: LABEL_C })
  })

  // QUOTATION title — 34pt bold, right-aligned
  drawText("QUOTATION", MARGIN_R, 781, { size: 34, bold: true, align: "right" })

  // Meta block (DATE / QUOTE # / CUSTOMER ID / VALID UNTIL) — right-aligned two-column
  const metaRows: [string, string][] = [
    ["DATE",        fmtDate(quote.quoteDate)],
    ["QUOTE #",     quote.quoteNumber],
    ["CUSTOMER ID", customerId ?? "—"],
    ["VALID UNTIL", fmtDate(quote.expiryDate)],
  ]
  let metaY = 761
  for (const [label, value] of metaRows) {
    drawText(label, 482, metaY, { size: 8, align: "right", color: LABEL_C })
    drawText(value, MARGIN_R, metaY, { size: 9, bold: true, align: "right" })
    metaY -= 13
  }

  // Full-width header separator
  drawHRule(715)

  // ── CUSTOMER / SITE ───────────────────────────────────────────────────────
  const halfW    = (CONTENT_W - 16) / 2   // two equal columns with 16pt gap
  const siteColX = MARGIN_L + halfW + 16

  drawSectionHeading("CUSTOMER", MARGIN_L, 703, halfW)
  let custY = 691
  drawText(truncateToWidth(quote.clientCompany, fontRegular, 10, halfW - 4), MARGIN_L, custY, { size: 10 })
  custY -= 13
  if (quote.contactName) {
    drawText(
      truncateToWidth(`Contact — ${quote.contactName}`, fontRegular, 9, halfW - 4),
      MARGIN_L, custY, { size: 9, color: LABEL_C }
    )
  }

  drawSectionHeading("SITE", siteColX, 703, halfW)
  drawText(truncateToWidth(quote.address, fontRegular, 10, halfW - 4), siteColX, 691, { size: 10 })

  drawHRule(672)

  // ── ITEM TABLE ────────────────────────────────────────────────────────────
  // Column x boundaries — columns separated by whitespace, no vertical dividers
  const COL_DESC_X  = MARGIN_L
  const COL_PO_X    = 362          // Purchase Order column start
  const COL_VAT_X   = 427          // VAT column start
  const COL_AMT_END = MARGIN_R     // Amount right edge
  const DESC_W      = COL_PO_X - COL_DESC_X - 6   // usable description width

  const ROW_H_MIN  = 22
  const ROW_LINE_H = 13
  // Space reserved below table for totals + terms + footer
  const FOOTER_RES = 200
  const PAGE_SAFE  = 40

  function drawTableHeader(p: typeof page, topY: number): number {
    const HDR_H = 18
    p.drawRectangle({ x: MARGIN_L, y: topY - HDR_H, width: CONTENT_W, height: HDR_H, color: CHARCOAL })
    const baseline = topY - HDR_H + 5
    const hdr = (text: string, x: number, align: "left" | "right" = "left") => {
      const w = fontBold.widthOfTextAtSize(text, 8)
      p.drawText(text, { x: align === "right" ? x - w : x, y: baseline, size: 8, font: fontBold, color: WHITE })
    }
    hdr("DESCRIPTION",    COL_DESC_X + 4)
    hdr("PURCHASE ORDER", COL_PO_X + 2)
    hdr("VAT",            COL_VAT_X + 2)
    hdr("AMOUNT",         COL_AMT_END, "right")
    return topY - HDR_H
  }

  let rowTop = drawTableHeader(page, 660)
  let paginationOccurred = false
  let bandIndex = 0

  for (const item of lineItems) {
    const descLines = wrapText(item.description, fontRegular, 10, DESC_W)
    const rowH = Math.max(ROW_H_MIN, descLines.length * ROW_LINE_H + 8)

    if (rowTop - rowH < PAGE_SAFE + FOOTER_RES) {
      drawText("Continued on next page…", MARGIN_L, rowTop - 10, { size: 8, color: LABEL_C })
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      rowTop = drawTableHeader(page, PAGE_HEIGHT - 56)
      drawText(`${COMPANY.name} — Quote ${quote.quoteNumber} (continued)`, MARGIN_L, PAGE_HEIGHT - 40, { size: 8, color: LABEL_C })
      paginationOccurred = true
      bandIndex = 0
    }

    if (bandIndex % 2 === 1) {
      page.drawRectangle({ x: MARGIN_L, y: rowTop - rowH, width: CONTENT_W, height: rowH, color: ROW_ALT })
    }

    let lineBase = rowTop - 8
    for (const line of descLines) {
      drawText(line, COL_DESC_X + 4, lineBase, { size: 10 })
      lineBase -= ROW_LINE_H
    }
    if (item.vatApplicable) drawText("X", COL_VAT_X + 6, rowTop - 8, { size: 10 })
    drawText(fmtNumber(item.amount), COL_AMT_END, rowTop - 8, { size: 10, align: "right" })

    // Thin horizontal rule at row bottom
    page.drawLine({
      start: { x: MARGIN_L, y: rowTop - rowH },
      end:   { x: MARGIN_R, y: rowTop - rowH },
      thickness: 0.5,
      color: RULE_C,
    })

    rowTop -= rowH
    bandIndex++
  }

  // Filler rows to maintain visual rhythm when there are few items
  const noPagination = !paginationOccurred
  if (noPagination) {
    while (bandIndex < 8 && rowTop - ROW_H_MIN >= PAGE_SAFE + FOOTER_RES) {
      if (bandIndex % 2 === 1) {
        page.drawRectangle({ x: MARGIN_L, y: rowTop - ROW_H_MIN, width: CONTENT_W, height: ROW_H_MIN, color: ROW_ALT })
      }
      page.drawLine({
        start: { x: MARGIN_L, y: rowTop - ROW_H_MIN },
        end:   { x: MARGIN_R, y: rowTop - ROW_H_MIN },
        thickness: 0.5,
        color: RULE_C,
      })
      rowTop -= ROW_H_MIN
      bandIndex++
    }
  }

  const tableBottom = rowTop

  // ── TOTALS (lower right) ───────────────────────────────────────────────────
  const TOTALS_LABEL_X = 493   // right edge for labels
  let totalsY = tableBottom - 18

  if (quote.vatRate != null) {
    const subtotalRows: [string, string][] = [
      ["Subtotal", fmtNumber(subtotal)],
      ["Taxable",  fmtNumber(taxable)],
      ["VAT Rate", `${quote.vatRate.toFixed(2)}%`],
      ["VAT Due",  fmtNumber(vatDue)],
    ]
    for (const [label, value] of subtotalRows) {
      drawText(label, TOTALS_LABEL_X, totalsY, { size: 9, align: "right", color: LABEL_C })
      drawText(value, MARGIN_R, totalsY, { size: 9, align: "right" })
      totalsY -= 14
    }
  }

  // TOTAL row — light grey background, bold 13pt
  const totalRowH  = 18
  const totalBgX   = MARGIN_L + CONTENT_W * 0.53
  page.drawRectangle({ x: totalBgX, y: totalsY - 3, width: MARGIN_R - totalBgX, height: totalRowH, color: TOTAL_BG })
  drawText("TOTAL",              TOTALS_LABEL_X, totalsY + 1, { size: 13, bold: true, align: "right" })
  drawText(`£ ${fmtNumber(total)}`, MARGIN_R,    totalsY + 1, { size: 13, bold: true, align: "right" })

  // ── TERMS AND CONDITIONS (lower left) ─────────────────────────────────────
  const TERMS_COL_W = CONTENT_W * 0.55 - 8
  const termsTopY   = tableBottom - 12

  drawSectionHeading("TERMS AND CONDITIONS", MARGIN_L, termsTopY, TERMS_COL_W)
  let termsY = termsTopY - 18

  for (let i = 0; i < TERMS.length; i++) {
    const lines = wrapText(`${i + 1}.  ${TERMS[i]}`, fontRegular, 9, TERMS_COL_W - 4)
    for (const line of lines) {
      drawText(line, MARGIN_L, termsY, { size: 9, color: LABEL_C })
      termsY -= 13
    }
    termsY -= 4
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const FOOTER_Y = 50

  drawHRule(FOOTER_Y + 14)   // thin rule above footer text

  // Four items evenly distributed across the full content width
  const addrLine = [
    COMPANY.addressLines[0].replace(/\.$/, ""),
    COMPANY.addressLines[1].replace(/\.$/, ""),
  ].join(", ")

  const footerItems = [
    { text: COMPANY.name,      x: MARGIN_L,                            align: "left"  as const },
    { text: addrLine,          x: MARGIN_L + CONTENT_W / 3,            align: "left"  as const },
    { text: `T: ${COMPANY.phone}`, x: MARGIN_L + (CONTENT_W / 3) * 2, align: "left"  as const },
    { text: `E: ${COMPANY.email}`, x: MARGIN_R,                        align: "right" as const },
  ]
  for (const item of footerItems) {
    drawText(item.text, item.x, FOOTER_Y, { size: 8, color: LABEL_C, align: item.align })
  }

  const pdfBytes = await doc.save()
  const safeNumber = quote.quoteNumber.replace(/[^a-zA-Z0-9\-_]/g, "_")
  return { pdfBytes, filename: `${safeNumber}.pdf` }
}

export async function generateQuotePdf(id: string): Promise<{ pdfPath: string }> {
  const { pdfBytes, filename } = await buildQuotePdfBuffer(id)

  const pdfPath = quotePdfDownloadUrl(id)
  await quoteService.updatePdfPath(id, pdfPath)

  const quote = await quoteService.findUnique(id)
  if (quote) setCachedQuotePdf(id, quote.updatedAt, pdfBytes, filename)

  return { pdfPath }
}
