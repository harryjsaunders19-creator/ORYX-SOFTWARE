/**
 * Quote PDF generation — extracted from the API route so it can run
 * in the background via next/server `after()`.
 *
 * Layout uses a derived coordinate system: every y position is computed
 * from CONTENT_TOP (page top minus margin) flowing downward, using the
 * spacing and typography constants below. No magic numbers in the drawing
 * section — only named constants and arithmetic on those constants.
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
const CONTENT_W   = MARGIN_R - MARGIN_L   // 507.5 pt

// ── Spacing scale (4-pt grid, all values in points) ──────────────────────────
const SP_XS  = 4
const SP_SM  = 8
const SP_MD  = 12
const SP_LG  = 16
const SP_XL  = 20
const SP_2XL = 28

// ── Typography scale (points) ─────────────────────────────────────────────────
const T_QUOT     = 36    // QUOTATION heading
const T_CO       = 22    // company name
const T_HEAD     = 11    // section labels (CUSTOMER, SITE, TERMS…)
const T_BODY     = 10    // table / body text
const T_META_LBL = 8     // metadata labels (DATE, QUOTE #…)
const T_META_VAL = 9.5   // metadata values
const T_DETAIL   = 8.5   // company detail / address lines
const T_TERMS    = 9     // terms & conditions text
const T_TOTAL    = 13    // TOTAL row text
const T_FOOTER   = 8.5   // footer text

// Liberation Sans proportional metrics (ratio × em)
const CAP = 0.72   // cap-height above baseline
const DSC = 0.21   // descender depth below baseline

// Derived line steps (size × leading, rounded to whole points)
const STEP_DETAIL = Math.round(T_DETAIL  * 1.45)   // ≈ 12 pt
const STEP_META   = 15                              // explicit — keeps meta block tidy
const STEP_BODY   = Math.round(T_BODY    * 1.5)    // 15 pt
const STEP_TERMS  = Math.round(T_TERMS   * 1.55)   // 14 pt

// ── Monochrome palette ────────────────────────────────────────────────────────
const INK      = rgb(0.051, 0.051, 0.051)   // #0D0D0D  near-black body text
const CHARCOAL = rgb(0.165, 0.165, 0.165)   // #2A2A2A  table header background
const WHITE    = rgb(1, 1, 1)
const RULE_C   = rgb(0.784, 0.784, 0.784)   // #C8C8C8  0.5 pt separator lines
const ROW_ALT  = rgb(0.961, 0.961, 0.961)   // #F5F5F5  alternating row tint
const TOTAL_BG = rgb(0.914, 0.914, 0.914)   // #E9E9E9  total row background
const LABEL_C  = rgb(0.424, 0.424, 0.424)   // #6C6C6C  muted labels / captions

// ── Table geometry — proportional column fractions ────────────────────────────
// Description 60 % | Purchase Order 18 % | VAT 8 % | Amount 14 %
const COL_DESC_X  = MARGIN_L
const COL_PO_X    = Math.round(MARGIN_L + CONTENT_W * 0.60)   // ≈ 348
const COL_VAT_X   = Math.round(COL_PO_X + CONTENT_W * 0.18)   // ≈ 439
const COL_AMT_END = MARGIN_R

const CELL_PAD       = 8
const DESC_W         = COL_PO_X - COL_DESC_X - CELL_PAD   // description wrap width ≈ 296

const TABLE_HDR_H    = 22   // charcoal header band height
const TABLE_ROW_H    = 24   // minimum row height
const TABLE_ROW_LINE = STEP_BODY

// Points reserved below last table row for totals + terms + footer
const FOOTER_RES = 240
const PAGE_SAFE  = 40

// ── Vertical layout — all positions derived from CONTENT_TOP ──────────────────
//
//  CONTENT_TOP (789.89)
//    └─ QUOTATION baseline        Y_QUOT       ≈ 764
//    └─ QUOTATION descender       Y_QUOT_DESC  ≈ 756
//       └─ Meta row 1             Y_META_1     ≈ 744  (right col)
//       └─ Company name baseline  Y_CO_NAME    ≈ 732  (left col, clears QUOT desc)
//          └─ Detail line 1       Y_DETAIL_1   ≈ 711
//          └─ ...
//    └─ Header rule               Y_HDR_RULE   = min(detail_last, meta_last) − SP_MD
//    └─ Customer / Site headings  Y_CUST_HEAD  = Y_HDR_RULE − SP_XL
//    └─ Section separator         dynamic       = min(custBottom, siteBottom) − SP_SM
//    └─ Table header              dynamic       = separator − SP_MD
//
const CONTENT_TOP = PAGE_HEIGHT - 52   // ≈ 789.89  (52 pt ≈ 18 mm top margin)

// Logo dimensions (preserved from original brand asset)
const LOGO_W = 92.8
const LOGO_H = 56.9

// Company text column begins after logo
const CO_X = MARGIN_L + LOGO_W + SP_LG   // ≈ 152.5

// QUOTATION: cap top aligned with CONTENT_TOP
const Y_QUOT      = Math.round(CONTENT_TOP - T_QUOT * CAP)      // 764
const Y_QUOT_DESC = Math.round(Y_QUOT - T_QUOT * DSC)           // 756

// Company name: baseline placed so its cap top is safely below QUOTATION's descender
const Y_CO_NAME   = Math.round(Y_QUOT_DESC - T_CO * CAP - SP_SM)  // ≈ 732

// First detail line: clears company name descender with a comfortable gap
const Y_CO_DESC   = Math.round(Y_CO_NAME - T_CO * DSC)            // ≈ 727
const Y_DETAIL_1  = Y_CO_DESC - SP_LG                             // ≈ 711

// Meta rows: first row clears QUOTATION descender
const Y_META_1    = Y_QUOT_DESC - SP_MD                           // ≈ 744

// Meta label right-edge column (values stay right-aligned to MARGIN_R)
const META_LBL_X  = MARGIN_R - SP_2XL * 2 - SP_MD                // ≈ 475

// Max width for detail lines (stop before meta label column)
const DETAIL_MAX_W = META_LBL_X - CO_X - SP_MD                   // ≈ 310

// ── Company / Terms data ──────────────────────────────────────────────────────
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

// ── Pure helpers ──────────────────────────────────────────────────────────────
function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  try { return format(new Date(d), "dd/MM/yyyy") } catch { return d }
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
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

// ── Main export ───────────────────────────────────────────────────────────────
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
      align?: "left" | "right"
    }
  ) => {
    const font  = opts.bold ? fontBold : fontRegular
    const drawX = opts.align === "right"
      ? x - font.widthOfTextAtSize(text, opts.size)
      : x
    page.drawText(text, { x: drawX, y: baselineY, size: opts.size, font, color: opts.color ?? INK })
  }

  function drawHRule(y: number, x1 = MARGIN_L, x2 = MARGIN_R) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: RULE_C })
  }

  /**
   * Draws a bold section label (T_HEAD) then a 0.5pt rule below it.
   * Returns the y-coordinate of the rule so callers can position content below it.
   */
  function drawSectionHeading(label: string, x: number, topY: number, colWidth: number): number {
    drawText(label, x, topY, { size: T_HEAD, bold: true })
    const ruleY = topY - Math.round(T_HEAD * DSC) - SP_XS   // clears descenders + breathing room
    page.drawLine({ start: { x, y: ruleY }, end: { x: x + colWidth, y: ruleY }, thickness: 0.5, color: RULE_C })
    return ruleY
  }

  function truncateToWidth(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
    let result = text
    while (result.length > 1 && font.widthOfTextAtSize(result + "…", size) > maxWidth) {
      result = result.slice(0, -1)
    }
    return result + "…"
  }

  /** Draws a charcoal table header band and returns the y of the first data row. */
  function drawTableHeader(p: typeof page, topY: number): number {
    p.drawRectangle({ x: MARGIN_L, y: topY - TABLE_HDR_H, width: CONTENT_W, height: TABLE_HDR_H, color: CHARCOAL })
    // Vertically centre the 10pt text within the band
    const baseline = topY - TABLE_HDR_H + Math.round((TABLE_HDR_H - T_BODY * CAP) / 2)
    const hdr = (text: string, x: number, align: "left" | "right" = "left") => {
      const w = fontBold.widthOfTextAtSize(text, T_BODY)
      p.drawText(text, { x: align === "right" ? x - w : x, y: baseline, size: T_BODY, font: fontBold, color: WHITE })
    }
    hdr("DESCRIPTION",    COL_DESC_X + CELL_PAD)
    hdr("PURCHASE ORDER", COL_PO_X   + CELL_PAD)
    hdr("VAT",            COL_VAT_X  + CELL_PAD)
    hdr("AMOUNT",         COL_AMT_END,            "right")
    return topY - TABLE_HDR_H
  }

  // ── HEADER ────────────────────────────────────────────────────────────────

  // Logo — positioned so its top edge aligns with CONTENT_TOP
  page.drawImage(logoImage, {
    x: MARGIN_L,
    y: CONTENT_TOP - LOGO_H,   // pdf-lib y = bottom-left
    width:  LOGO_W,
    height: LOGO_H,
  })

  // QUOTATION title — cap top aligns with CONTENT_TOP (top of logo)
  drawText("QUOTATION", MARGIN_R, Y_QUOT, { size: T_QUOT, bold: true, align: "right" })

  // Meta block — right column, below QUOTATION descender
  const metaRows: [string, string][] = [
    ["DATE",        fmtDate(quote.quoteDate)],
    ["QUOTE #",     quote.quoteNumber],
    ["CUSTOMER ID", customerId ?? "—"],
    ["VALID UNTIL", fmtDate(quote.expiryDate)],
  ]
  let metaY = Y_META_1
  for (const [label, value] of metaRows) {
    drawText(label, META_LBL_X, metaY, { size: T_META_LBL, align: "right", color: LABEL_C })
    drawText(value, MARGIN_R,   metaY, { size: T_META_VAL, bold: true,      align: "right" })
    metaY -= STEP_META
  }
  const Y_META_LAST = metaY + STEP_META   // y of the last meta row drawn

  // Company name — left column, baseline safely below QUOTATION descender
  drawText(COMPANY.name, CO_X, Y_CO_NAME, { size: T_CO, bold: true })

  // Company detail lines — below company name, constrained to avoid meta column
  const details = [
    COMPANY.addressLines[0],
    COMPANY.addressLines[1],
    `T: ${COMPANY.phone}`,
    `Prepared by: ${preparedBy}`,
  ]
  let detailY = Y_DETAIL_1
  for (const line of details) {
    drawText(truncateToWidth(line, fontRegular, T_DETAIL, DETAIL_MAX_W), CO_X, detailY, { size: T_DETAIL, color: LABEL_C })
    detailY -= STEP_DETAIL
  }
  const Y_DETAIL_LAST = detailY + STEP_DETAIL   // y of last detail drawn

  // Full-width header rule — 12 pt below the lower of the two columns
  const Y_HDR_RULE = Math.min(Y_DETAIL_LAST, Y_META_LAST) - SP_MD
  drawHRule(Y_HDR_RULE)

  // ── CUSTOMER / SITE ───────────────────────────────────────────────────────
  const halfW    = (CONTENT_W - SP_LG) / 2   // ≈ 245.75 pt per column
  const siteColX = MARGIN_L + halfW + SP_LG   // ≈ 305.45

  const Y_CUST_HEAD = Y_HDR_RULE - SP_XL   // 20 pt breathing room below rule

  const custRuleY = drawSectionHeading("CUSTOMER", MARGIN_L, Y_CUST_HEAD, halfW)
  const siteRuleY = drawSectionHeading("SITE",     siteColX, Y_CUST_HEAD, halfW)

  // Both columns start content at the same y (below the heading rule)
  let custY = custRuleY - SP_MD
  let siteY = siteRuleY - SP_MD

  // Customer name — wraps cleanly rather than truncating
  const custNameLines = wrapText(quote.clientCompany, fontRegular, T_BODY, halfW - SP_SM)
  for (const line of custNameLines) {
    drawText(line, MARGIN_L, custY, { size: T_BODY })
    custY -= STEP_BODY
  }
  if (quote.contactName) {
    drawText(
      truncateToWidth(`Contact — ${quote.contactName}`, fontRegular, T_BODY - 1, halfW - SP_SM),
      MARGIN_L, custY, { size: T_BODY - 1, color: LABEL_C }
    )
    custY -= STEP_BODY
  }

  // Site address — wraps cleanly rather than truncating
  const siteAddrLines = wrapText(quote.address, fontRegular, T_BODY, halfW - SP_SM)
  for (const line of siteAddrLines) {
    drawText(line, siteColX, siteY, { size: T_BODY })
    siteY -= STEP_BODY
  }

  // Full-width section separator — below the lower column + small gap
  const Y_SEC_RULE = Math.min(custY, siteY) - SP_SM
  drawHRule(Y_SEC_RULE)

  // ── ITEM TABLE ────────────────────────────────────────────────────────────
  let rowTop = drawTableHeader(page, Y_SEC_RULE - SP_MD)
  let paginationOccurred = false
  let bandIndex = 0

  for (const item of lineItems) {
    const descLines = wrapText(item.description, fontRegular, T_BODY, DESC_W)
    const rowH = Math.max(TABLE_ROW_H, descLines.length * TABLE_ROW_LINE + CELL_PAD)

    if (rowTop - rowH < PAGE_SAFE + FOOTER_RES) {
      drawText("Continued on next page…", MARGIN_L, rowTop - SP_MD, { size: T_DETAIL, color: LABEL_C })
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      rowTop = drawTableHeader(page, PAGE_HEIGHT - SP_LG * 3)
      drawText(
        `${COMPANY.name} — Quote ${quote.quoteNumber} (continued)`,
        MARGIN_L, PAGE_HEIGHT - SP_LG, { size: T_DETAIL, color: LABEL_C }
      )
      paginationOccurred = true
      bandIndex = 0
    }

    if (bandIndex % 2 === 1) {
      page.drawRectangle({ x: MARGIN_L, y: rowTop - rowH, width: CONTENT_W, height: rowH, color: ROW_ALT })
    }

    // Description (may wrap)
    const textBase = rowTop - CELL_PAD
    let lineBase   = textBase
    for (const line of descLines) {
      drawText(line, COL_DESC_X + CELL_PAD, lineBase, { size: T_BODY })
      lineBase -= TABLE_ROW_LINE
    }
    // VAT indicator (centre-ish within the VAT column)
    if (item.vatApplicable) drawText("X", COL_VAT_X + CELL_PAD + 2, textBase, { size: T_BODY })
    // Amount (right-aligned to column edge)
    drawText(fmtNumber(item.amount), COL_AMT_END, textBase, { size: T_BODY, align: "right" })

    page.drawLine({ start: { x: MARGIN_L, y: rowTop - rowH }, end: { x: MARGIN_R, y: rowTop - rowH }, thickness: 0.5, color: RULE_C })
    rowTop -= rowH
    bandIndex++
  }

  // Filler rows — maintain visual rhythm on short quotes
  if (!paginationOccurred) {
    while (bandIndex < 8 && rowTop - TABLE_ROW_H >= PAGE_SAFE + FOOTER_RES) {
      if (bandIndex % 2 === 1) {
        page.drawRectangle({ x: MARGIN_L, y: rowTop - TABLE_ROW_H, width: CONTENT_W, height: TABLE_ROW_H, color: ROW_ALT })
      }
      page.drawLine({ start: { x: MARGIN_L, y: rowTop - TABLE_ROW_H }, end: { x: MARGIN_R, y: rowTop - TABLE_ROW_H }, thickness: 0.5, color: RULE_C })
      rowTop -= TABLE_ROW_H
      bandIndex++
    }
  }

  const tableBottom = rowTop

  // ── TOTALS — lower right, below table ─────────────────────────────────────
  // Label right-edge: ~28% of content width from MARGIN_R
  const TOTALS_LBL_X = Math.round(MARGIN_R - CONTENT_W * 0.28)   // ≈ 409
  let totalsY = tableBottom - SP_XL

  if (quote.vatRate != null) {
    const subRows: [string, string][] = [
      ["Subtotal", fmtNumber(subtotal)],
      ["Taxable",  fmtNumber(taxable)],
      ["VAT Rate", `${quote.vatRate.toFixed(2)}%`],
      ["VAT Due",  fmtNumber(vatDue)],
    ]
    for (const [label, value] of subRows) {
      drawText(label, TOTALS_LBL_X, totalsY, { size: 9,   align: "right", color: LABEL_C })
      drawText(value, MARGIN_R,     totalsY, { size: 9,   align: "right" })
      totalsY -= SP_LG   // 16 pt step — comfortable spacing between rows
    }
  }

  // TOTAL row — light grey background, bold, slightly larger type
  const totalRowH = SP_XL   // 20 pt band height
  const totalBgX  = TOTALS_LBL_X - SP_XL   // background begins before the label
  page.drawRectangle({ x: totalBgX, y: totalsY - SP_XS, width: MARGIN_R - totalBgX, height: totalRowH, color: TOTAL_BG })
  drawText("TOTAL",                  TOTALS_LBL_X, totalsY + SP_XS, { size: T_TOTAL, bold: true, align: "right" })
  drawText(`£ ${fmtNumber(total)}`,  MARGIN_R,     totalsY + SP_XS, { size: T_TOTAL, bold: true, align: "right" })

  // ── TERMS AND CONDITIONS — lower left, below table ────────────────────────
  // Column occupies the left ~55% of content width, leaving the right side for totals
  const TERMS_COL_W = Math.round(CONTENT_W * 0.55) - SP_SM   // ≈ 271 pt

  let termsY = tableBottom - SP_MD
  const termsRuleY = drawSectionHeading("TERMS AND CONDITIONS", MARGIN_L, termsY, TERMS_COL_W)
  termsY = termsRuleY - SP_LG   // comfortable gap below the heading rule

  for (let i = 0; i < TERMS.length; i++) {
    const lines = wrapText(`${i + 1}.  ${TERMS[i]}`, fontRegular, T_TERMS, TERMS_COL_W - SP_SM)
    for (const line of lines) {
      drawText(line, MARGIN_L, termsY, { size: T_TERMS, color: LABEL_C })
      termsY -= STEP_TERMS   // 14 pt step → 1.55× leading on 9 pt text
    }
    termsY -= SP_SM   // extra gap between numbered items
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const FOOTER_Y    = 48
  const FOOTER_RULE = FOOTER_Y + SP_MD   // rule sits 12 pt above text baseline

  drawHRule(FOOTER_RULE)

  // Four items distributed evenly: name | city+postcode | phone | email
  // Using addr line 2 (short: "Bristol, BS30 6ES") keeps the footer uncluttered.
  const footerColW = CONTENT_W / 3

  const footerItems: Array<{ text: string; x: number; align: "left" | "right" }> = [
    { text: COMPANY.name,                                       x: MARGIN_L,                 align: "left"  },
    { text: COMPANY.addressLines[1].replace(/\.$/, ""),         x: MARGIN_L + footerColW,    align: "left"  },
    { text: `T: ${COMPANY.phone}`,                              x: MARGIN_L + footerColW * 2, align: "left"  },
    { text: `E: ${COMPANY.email}`,                              x: MARGIN_R,                 align: "right" },
  ]

  const footerMaxW = footerColW - SP_SM   // per-column truncation limit

  for (const item of footerItems) {
    const displayed = item.align === "left"
      ? truncateToWidth(item.text, fontRegular, T_FOOTER, footerMaxW)
      : item.text
    drawText(displayed, item.x, FOOTER_Y, { size: T_FOOTER, color: LABEL_C, align: item.align })
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
