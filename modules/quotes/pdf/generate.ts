/**
 * Quote PDF generation — extracted from the API route so it can run
 * in the background via next/server `after()`.
 *
 * Shared entry points:
 *   buildQuotePdfFromPayload(data) — render any QuotationPdfData
 *   buildQuotePdfBuffer(id)        — load a quote record then render
 *
 * ─── Layout engine ────────────────────────────────────────────────────────────
 * Every drawing function signature is:
 *
 *   drawFoo(startY: number, …args): number   // returns endY (always ≤ startY)
 *
 * The caller chains them: the returned y becomes the next function's startY.
 * This gives the same flow-and-wrap guarantees as CSS Flexbox column layout
 * without requiring a browser renderer.
 *
 * Three-column header:
 *   [Logo | Company details | QUOTATION + meta]
 * Each column is drawn independently from the same topY.
 * The section ends at min(col1EndY, col2EndY, col3EndY).
 *
 * Every variable-length field (customer name, site address, description) is
 * wrapped, never truncated. Only truly fixed fields (footer items) are
 * truncated at their column boundary.
 * ──────────────────────────────────────────────────────────────────────────────
 */
import { quotePdfDownloadUrl } from "./urls"
import { setCachedQuotePdf } from "./cache"
import { quoteService } from "../services/quote-service"
import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { format } from "date-fns"
import fs from "fs/promises"
import path from "path"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"
import { QUOTE_COMPANY, DEFAULT_QUOTE_TERMS } from "./company"
import { mapQuoteRecordToQuotationPdfData } from "./map-quote-to-pdf-data"
import {
  firstLineBaselineY,
  measureTableRowHeight,
  wrapTextToWidth,
  capH,
  dscH,
} from "./table-layout"
import type { QuotationPdfData } from "./types"

// ── Page geometry ─────────────────────────────────────────────────────────────
const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_L    = 43.7
const MARGIN_R    = 551.2
const CONTENT_W   = MARGIN_R - MARGIN_L   // 507.5 pt

// ── Spacing scale (4-pt grid) ─────────────────────────────────────────────────
const SP_XS  = 4
const SP_SM  = 8
const SP_MD  = 12
const SP_LG  = 16
const SP_XL  = 24
/** Gap between major sections (~6–7 mm) — efficient without feeling cramped. */
const SP_SECTION = 22

// ── Typography scale (points) — fewer sizes, clearer hierarchy ────────────────
const T_QUOT     = 28    // QUOTATION title — ~15% under former QUOTE size
const T_CO       = 15    // company name (single line; never wraps)
const T_HEAD     = 11.5  // black section labels — SemiBold 11–12pt
const T_BODY     = 10    // body / table / customer / site
const T_META_LBL = 8     // metadata labels / captions
const T_META_VAL = 10    // metadata values
const T_QUOTE_NO = 13    // quotation number — primary value under title
const T_DETAIL   = 9     // company detail lines
const T_TERMS    = 9     // terms text
const T_TOTAL    = 12    // TOTAL row
const T_FOOTER   = 8     // footer

// Line step helpers — slightly more open for calmer header/body rhythm
const STEP_DETAIL = Math.round(T_DETAIL  * 1.75)
const STEP_META   = 20
const STEP_BODY   = Math.round(T_BODY    * 1.52)
const STEP_TERMS  = Math.round(T_TERMS   * 1.55)

// ── Monochrome palette — print-friendly, light fills ──────────────────────────
const INK      = rgb(0.05, 0.05, 0.05)
const CHARCOAL = rgb(0.12, 0.12, 0.12)
const WHITE    = rgb(1, 1, 1)
const RULE_C   = rgb(0.88, 0.88, 0.88)     // light hairline rules
const ROW_ALT  = rgb(0.980, 0.980, 0.980)  // #FAFAFA — barely-noticeable zebra
const TOTAL_BG = rgb(0.973, 0.973, 0.973)  // #F8F8F8 — soft TOTAL highlight
const LABEL_C  = rgb(0.42, 0.42, 0.42)

/** Uniform border / rule thickness (~0.75 pt). */
const BORDER_W = 0.75

// ── Table column widths (proportional) ───────────────────────────────────────
const COL_DESC_X  = MARGIN_L
const COL_PO_X    = Math.round(MARGIN_L + CONTENT_W * 0.58)
const COL_VAT_X   = Math.round(COL_PO_X  + CONTENT_W * 0.19)
const COL_AMT_END = MARGIN_R

const CELL_PAD_X     = 8    // horizontal cell padding — currency / text breathing room
/** Vertical pad above first glyph / below last descender — multi-line rows expand around this. */
const CELL_PAD_Y     = 6
const DESC_W         = COL_PO_X - COL_DESC_X - CELL_PAD_X * 2
const PO_W           = COL_VAT_X - COL_PO_X - CELL_PAD_X * 2

/** Shared black header height — elegant labels (~38% shorter than original ~24.5). */
const HEADER_H       = 15.0
const HEADER_PAD_X   = 8
const HEADER_TRACK   = 0.75 // slight letter-spacing

/** Minimum data row height for one-line items — multi-line rows grow past this. */
const TABLE_ROW_H    = 22
const TABLE_ROW_STEP = STEP_BODY
/** Filler rows extend the table so the page fills ~85–90% without grey blocks. */
const TABLE_FILLER_MAX = 8

/** Reserve space below the table for terms + totals + footer on the same page. */
const FOOTER_RES = 205
const PAGE_SAFE  = 40

// ── Header grid: ~60% branding / ~40% quotation meta ─────────────────────────
// Slightly over 60% so "ORYX Scaffold Design Ltd" stays on one line at T_CO.
const HEAD_LEFT_W  = Math.round(CONTENT_W * 0.63)
const HEAD_RIGHT_X = MARGIN_L + HEAD_LEFT_W

// Logo ~16% larger than original template (92.8×56.9); same top-left position.
const LOGO_W = 108
const LOGO_H = 66.2
const CO_X   = MARGIN_L + LOGO_W + 10
const DETAIL_MAX_W = HEAD_RIGHT_X - CO_X - SP_SM

// Meta: values right-align to MARGIN_R; labels sit left of values
const META_LBL_X = MARGIN_R - 108

// ── Page layout anchor ────────────────────────────────────────────────────────
const CONTENT_TOP = PAGE_HEIGHT - 52   // balanced top margin
const FOOTER_Y    = 38
const FOOTER_RULE = FOOTER_Y + SP_XL + SP_SM   // generous space before footer

const COMPANY = QUOTE_COMPANY

// ── Pure helpers ──────────────────────────────────────────────────────────────
function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  try { return format(new Date(d), "dd/MM/yyyy") } catch { return d }
}

function wrapText(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number
): string[] {
  return wrapTextToWidth(
    text,
    (s) => font.widthOfTextAtSize(s, size),
    maxWidth,
  )
}

function resolveLineItems(data: QuotationPdfData) {
  const items = data.items.map((item, index) => ({
    ...item,
    purchaseOrder:
      item.purchaseOrder
      ?? (index === 0 ? data.purchaseOrder ?? null : null),
  }))
  return items
}

/**
 * Render a quotation PDF from the shared QuotationPdfData model.
 * Used by the Quotes module and Site Visit Calculator export.
 */
export async function buildQuotePdfFromPayload(
  data: QuotationPdfData
): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  const preparedBy = data.preparedBy
  const customerId = data.customerId
  const lineItems = resolveLineItems(data)
  const terms = data.terms.length ? data.terms : [...DEFAULT_QUOTE_TERMS]

  const subtotal = data.subtotal
  const taxable  = data.taxable ?? lineItems.filter(li => li.vatApplicable).reduce((s, li) => s + li.amount, 0)
  const vatDue   = data.vatAmount
  const total    = data.grandTotal
  const vatRate  = data.vatRate

  // ── PDF document + assets ─────────────────────────────────────────────────
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  const [regularBytes, boldBytes, semiBoldBytes] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-SemiBold.ttf")),
  ])
  const fontRegular = await doc.embedFont(regularBytes)
  const fontBold    = await doc.embedFont(boldBytes)
  const fontSemi    = await doc.embedFont(semiBoldBytes)

  const logoBytes = await fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH))
  const logoImage = await doc.embedJpg(logoBytes)

  // ── Drawing primitives ────────────────────────────────────────────────────
  //
  // All primitives operate on the current `page` closure variable, so they
  // automatically use the correct page after a page-break.

  type DrawOpts = {
    size:   number
    bold?:  boolean
    color?: ReturnType<typeof rgb>
    align?: "left" | "right"
  }

  const drawText = (text: string, x: number, baselineY: number, opts: DrawOpts) => {
    const font  = opts.bold ? fontBold : fontRegular
    const drawX = opts.align === "right"
      ? x - font.widthOfTextAtSize(text, opts.size)
      : x
    page.drawText(text, {
      x: drawX,
      y: baselineY,
      size:  opts.size,
      font,
      color: opts.color ?? INK,
    })
  }

  /**
   * Draw wrapped text. Returns y AFTER the last line.
   * Every line advances by `step` (defaults to size × 1.5).
   */
  const drawWrapped = (
    text: string,
    x: number,
    startY: number,
    maxW: number,
    opts: DrawOpts & { step?: number }
  ): number => {
    const font = opts.bold ? fontBold : fontRegular
    const step = opts.step ?? Math.round(opts.size * 1.5)
    let y = startY
    for (const line of wrapText(text, font, opts.size, maxW)) {
      drawText(line, x, y, opts)
      y -= step
    }
    return y
  }

  /**
   * Truncate text to fit within maxWidth, appending "…" if needed.
   */
  const truncate = (text: string, maxW: number, size: number, bold = false): string => {
    const font = bold ? fontBold : fontRegular
    if (font.widthOfTextAtSize(text, size) <= maxW) return text
    let s = text
    while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxW) {
      s = s.slice(0, -1)
    }
    return s + "…"
  }

  const drawHRule = (y: number, x1 = MARGIN_L, x2 = MARGIN_R) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: BORDER_W, color: RULE_C })

  /**
   * Black section header — SemiBold labels, identical height for all sections.
   * Returns the y at the bottom of the band (content starts below + padding).
   */
  const drawSpacedHeaderText = (
    p: typeof page,
    label: string,
    x: number,
    baseline: number,
    align: "left" | "right" = "left",
  ) => {
    const chars = label.split("")
    let textW = 0
    for (let i = 0; i < chars.length; i++) {
      textW += fontSemi.widthOfTextAtSize(chars[i]!, T_HEAD)
      if (i < chars.length - 1) textW += HEADER_TRACK
    }
    let cx = align === "right" ? x - textW : x
    for (const ch of chars) {
      p.drawText(ch, {
        x: cx, y: baseline, size: T_HEAD, font: fontSemi, color: WHITE,
      })
      cx += fontSemi.widthOfTextAtSize(ch, T_HEAD) + HEADER_TRACK
    }
  }

  const drawBlackHeader = (label: string, x: number, topY: number, width: number): number => {
    const bandBottom = topY - HEADER_H
    page.drawRectangle({
      x, y: bandBottom, width, height: HEADER_H, color: CHARCOAL,
    })
    const baseline = topY - HEADER_H + Math.round((HEADER_H - capH(T_HEAD)) / 2)
    drawSpacedHeaderText(page, label, x + HEADER_PAD_X, baseline, "left")
    return bandBottom
  }

  /**
   * Draw the charcoal table header band and return the y of the first data row.
   */
  const drawTableHeader = (p: typeof page, topY: number): number => {
    p.drawRectangle({
      x: MARGIN_L, y: topY - HEADER_H, width: CONTENT_W, height: HEADER_H, color: CHARCOAL,
    })
    const baseline = topY - HEADER_H + Math.round((HEADER_H - capH(T_HEAD)) / 2)
    drawSpacedHeaderText(p, "DESCRIPTION",    COL_DESC_X + HEADER_PAD_X, baseline, "left")
    drawSpacedHeaderText(p, "PURCHASE ORDER", COL_VAT_X - CELL_PAD_X,    baseline, "right")
    drawSpacedHeaderText(p, "VAT",            COL_VAT_X + CELL_PAD_X,    baseline, "left")
    drawSpacedHeaderText(p, "AMOUNT",         COL_AMT_END - CELL_PAD_X,  baseline, "right")
    return topY - HEADER_H
  }

  // ── SECTION 1: Header (three independent columns) ─────────────────────────
  //
  // Each column is drawn from CONTENT_TOP downward independently.
  // The header ends at min(col1End, col2End, col3End).
  //
  //  Col 1: Logo
  //  Col 2: Company name + detail lines
  //  Col 3: QUOTATION title + meta rows

  // Column 1 — Logo (top-left, same position)
  page.drawImage(logoImage, {
    x: MARGIN_L, y: CONTENT_TOP - LOGO_H, width: LOGO_W, height: LOGO_H,
  })
  const col1End = CONTENT_TOP - LOGO_H

  // Column 3 — QUOTATION + Quotation No. + meta (right ~37%)
  // Hierarchy: Logo → QUOTATION → Quotation No. → dates / customer id
  const quotBaseline = CONTENT_TOP - capH(T_QUOT)
  drawText("QUOTATION", MARGIN_R, quotBaseline, { size: T_QUOT, bold: true, align: "right" })

  // Quotation No. — subtle caption above a prominent reference value
  let metaY = quotBaseline - dscH(T_QUOT) - SP_LG - SP_XS
  drawText("Quotation No.", MARGIN_R, metaY, {
    size: T_META_LBL,
    align: "right",
    color: LABEL_C,
  })
  metaY -= Math.round(T_META_LBL * 1.6)
  drawText(data.quotationNumber, MARGIN_R, metaY, {
    size: T_QUOTE_NO,
    bold: true,
    align: "right",
  })
  metaY -= dscH(T_QUOTE_NO) + SP_LG + SP_XS

  const metaRows: [string, string][] = [
    ["DATE",        fmtDate(data.issueDate)],
    ["CUSTOMER ID", customerId ?? "—"],
    ["VALID UNTIL", fmtDate(data.validUntil)],
  ]
  for (const [label, value] of metaRows) {
    drawText(label, META_LBL_X, metaY, { size: T_META_LBL, align: "right", color: LABEL_C })
    drawText(value, MARGIN_R,   metaY, { size: T_META_VAL, bold: true, align: "right" })
    metaY -= STEP_META
  }
  const col3End = metaY + STEP_META - dscH(T_META_VAL)

  // Column 2 — Company information (beside logo; column widened for single-line name)
  // Company name is ALWAYS a single line — never wraps.
  const details: string[] = [
    COMPANY.addressLines[0],
    COMPANY.addressLines[1],
    `T: ${COMPANY.phone}`,
    `E: ${COMPANY.email}`,
    `W: ${COMPANY.website}`,
    `Prepared by: ${preparedBy}`,
  ]
  // Align company block top with logo / QUOTATION — shared top margin
  const coNameBaseline = CONTENT_TOP - capH(T_CO)

  drawText(COMPANY.name, CO_X, coNameBaseline, { size: T_CO, bold: true })

  let detailY = coNameBaseline - dscH(T_CO) - SP_MD
  for (const line of details) {
    drawText(truncate(line, DETAIL_MAX_W, T_DETAIL), CO_X, detailY, {
      size: T_DETAIL,
      color: LABEL_C,
    })
    detailY -= STEP_DETAIL
  }
  const col2End = detailY + STEP_DETAIL - dscH(T_DETAIL)

  // Header ends at the lowest of all three columns — then calm breathing room
  const headerEnd = Math.min(col1End, col2End, col3End)
  const hdrRuleY = headerEnd - SP_SECTION
  drawHRule(hdrRuleY)

  // ── SECTION 2: Customer / Site (two equal columns) ────────────────────────
  const halfW    = (CONTENT_W - SP_LG) / 2
  const siteColX = MARGIN_L + halfW + SP_LG

  const custHeadY = hdrRuleY - SP_SECTION

  // Identical black headers for both columns
  const custBandBottom = drawBlackHeader("CUSTOMER", MARGIN_L, custHeadY, halfW)
  const siteBandBottom = drawBlackHeader("SITE",     siteColX, custHeadY, halfW)

  // Internal padding below black headers — tighter, still readable
  let custY = custBandBottom - SP_MD
  let siteY = siteBandBottom - SP_MD

  // Customer company name — wraps naturally
  const clientLabel = data.client.trim() || "—"
  custY = drawWrapped(clientLabel, MARGIN_L + SP_MD, custY, halfW - SP_LG, {
    size: T_BODY, step: STEP_BODY, bold: true,
  })
  // Contact line — truncated (single line)
  if (data.contact) {
    drawText(
      truncate(`Contact — ${data.contact}`, halfW - SP_LG, T_BODY),
      MARGIN_L + SP_MD, custY, { size: T_BODY, color: LABEL_C }
    )
    custY -= STEP_BODY
  }

  // Site address — wraps naturally
  siteY = drawWrapped(data.site, siteColX + SP_MD, siteY, halfW - SP_LG, {
    size: T_BODY, step: STEP_BODY,
  })

  // Modest bottom padding — avoid oversized empty areas
  custY -= SP_SM
  siteY -= SP_SM

  // Section ends at whichever column is taller
  const csEnd    = Math.min(custY, siteY)
  const secRuleY = csEnd - SP_SECTION
  drawHRule(secRuleY)

  // ── SECTION 3: Item Table (flow-based, content-driven row heights) ────────
  //
  // Each row measures its own height from wrapped description lines, then
  // advances currentY. PO / VAT / Amount share the first-line baseline.
  // Dividers are drawn at the measured row bottom — never through text.

  const rowMetricsBase = {
    fontSize: T_BODY,
    lineStep: TABLE_ROW_STEP,
    minRowHeight: TABLE_ROW_H,
    cellPadY: CELL_PAD_Y,
  } as const

  /** Bottom of the charcoal header band — first row starts immediately below. */
  let currentY = drawTableHeader(page, secRuleY - SP_SECTION)
  let paginationOccurred = false
  let bandIndex = 0

  for (const item of lineItems) {
    const descLines = wrapText(item.description, fontRegular, T_BODY, DESC_W)
    const lineCount = Math.max(1, descLines.length)
    const rowH = measureTableRowHeight({ ...rowMetricsBase, lineCount })

    // Page overflow → new page (keep terms/totals/footer reservation)
    if (currentY - rowH < PAGE_SAFE + FOOTER_RES) {
      drawText("Continued on next page…", MARGIN_L, currentY - SP_MD, {
        size: T_DETAIL, color: LABEL_C,
      })
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      drawText(
        `${COMPANY.name} — Quote ${data.quotationNumber} (continued)`,
        MARGIN_L, PAGE_HEIGHT - SP_LG, { size: T_DETAIL, color: LABEL_C }
      )
      currentY = drawTableHeader(page, PAGE_HEIGHT - SP_LG * 3)
      paginationOccurred = true
      bandIndex = 0
    }

    const rowTop = currentY
    const rowBottom = rowTop - rowH

    // Extremely subtle zebra — rules do the separation work
    if (bandIndex % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_L, y: rowBottom, width: CONTENT_W, height: rowH, color: ROW_ALT,
      })
    }

    // First-line baseline: centred for short rows, top-aligned for tall rows.
    // PO / VAT / Amount use the same baseline so columns stay aligned.
    const textBase = firstLineBaselineY(rowTop, rowH, {
      lineCount,
      fontSize: T_BODY,
      cellPadY: CELL_PAD_Y,
    })

    let lineBase = textBase
    for (const line of descLines) {
      drawText(line, COL_DESC_X + CELL_PAD_X, lineBase, { size: T_BODY })
      lineBase -= TABLE_ROW_STEP
    }
    // Purchase order (existing column — blank when unset)
    if (item.purchaseOrder?.trim()) {
      drawText(
        truncate(item.purchaseOrder.trim(), PO_W, T_BODY),
        COL_VAT_X - CELL_PAD_X,
        textBase,
        { size: T_BODY, align: "right" },
      )
    }
    // VAT indicator
    if (item.vatApplicable) {
      drawText("X", COL_VAT_X + CELL_PAD_X, textBase, { size: T_BODY })
    }
    // Amount right-aligned with consistent cell padding
    drawText(fmtNumber(item.amount), COL_AMT_END - CELL_PAD_X, textBase, {
      size: T_BODY, align: "right",
    })

    // Bottom rule — at the calculated row bottom, never through content
    page.drawLine({
      start: { x: MARGIN_L, y: rowBottom },
      end:   { x: MARGIN_R, y: rowBottom },
      thickness: BORDER_W,
      color: RULE_C,
    })

    currentY = rowBottom
    bandIndex++
  }

  // Filler rows — fewer empties; rules only (no grey blocks)
  if (!paginationOccurred) {
    while (bandIndex < TABLE_FILLER_MAX && currentY - TABLE_ROW_H >= PAGE_SAFE + FOOTER_RES) {
      const fillerBottom = currentY - TABLE_ROW_H
      page.drawLine({
        start: { x: MARGIN_L, y: fillerBottom },
        end:   { x: MARGIN_R, y: fillerBottom },
        thickness: BORDER_W, color: RULE_C,
      })
      currentY = fillerBottom
      bandIndex++
    }
  }

  const tableBottom = currentY

  // ── SECTION 4: Terms and Conditions (lower left) ──────────────────────────
  //
  // Terms occupy the left ~55 % of content width.
  // Totals occupy the right ~45 % — x ranges never overlap.
  // Both sections flow from the measured table bottom (never hard-coded Y).

  const TERMS_COL_W = Math.round(CONTENT_W * 0.54) - SP_SM
  const TERMS_RIGHT = MARGIN_L + TERMS_COL_W

  // If the table left too little room, continue terms/totals on a fresh page.
  const estimatedClosingH = 160
  let closingTop = tableBottom - SP_SECTION
  if (tableBottom - estimatedClosingH < FOOTER_RULE + SP_MD) {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    drawText(
      `${COMPANY.name} — Quote ${data.quotationNumber} (continued)`,
      MARGIN_L, PAGE_HEIGHT - SP_LG, { size: T_DETAIL, color: LABEL_C }
    )
    closingTop = PAGE_HEIGHT - SP_LG * 3
  }

  let termsY = closingTop
  const tBandBottom = drawBlackHeader("TERMS AND CONDITIONS", MARGIN_L, termsY, TERMS_COL_W)
  termsY = tBandBottom - SP_MD   // tighter padding below black header

  for (let i = 0; i < terms.length; i++) {
    termsY = drawWrapped(
      `${i + 1}.  ${terms[i]}`,
      MARGIN_L + SP_MD, termsY,
      TERMS_COL_W - SP_LG,
      { size: T_TERMS, color: LABEL_C, step: STEP_TERMS }
    )
    termsY -= SP_SM   // tighter between numbered items
  }

  // ── SECTION 5: Totals (lower right) ───────────────────────────────────────
  //
  // Labels right-align to TOTALS_LBL_X.
  // Values right-align to MARGIN_R.
  // The background of the TOTAL row starts at TERMS_RIGHT + SP_LG so it
  // never overlaps the terms text.

  const TOTALS_LBL_X = Math.round(MARGIN_R - CONTENT_W * 0.27)
  const TOTALS_VAL_X = MARGIN_R
  const TOTALS_STEP  = SP_LG   // tighter totals rhythm

  let totalsY = closingTop

  if (vatRate != null) {
    const subRows: [string, string][] = [
      ["Subtotal", fmtNumber(subtotal)],
      ["Taxable",  fmtNumber(taxable)],
      ["VAT Rate", `${vatRate.toFixed(2)}%`],
      ["VAT Due",  fmtNumber(vatDue)],
    ]
    for (const [label, value] of subRows) {
      drawText(label, TOTALS_LBL_X, totalsY, { size: T_BODY, align: "right", color: LABEL_C })
      drawText(value, TOTALS_VAL_X, totalsY, { size: T_BODY, align: "right" })
      totalsY -= TOTALS_STEP
    }
  }

  // TOTAL: hairline + compact tinted band (~25% shorter footprint)
  totalsY -= SP_SM
  page.drawLine({
    start: { x: Math.max(TERMS_RIGHT + SP_LG, TOTALS_LBL_X - SP_XL), y: totalsY + SP_MD },
    end:   { x: MARGIN_R, y: totalsY + SP_MD },
    thickness: BORDER_W,
    color: RULE_C,
  })
  totalsY -= SP_XS

  const totalBandX = Math.max(TERMS_RIGHT + SP_LG, TOTALS_LBL_X - SP_XL)
  const totalBandH = SP_MD + SP_SM   // ~20 pt — subtle highlight only
  page.drawRectangle({
    x: totalBandX,
    y: totalsY - SP_SM,
    width: MARGIN_R - totalBandX,
    height: totalBandH,
    color: TOTAL_BG,
  })
  const totalBaseline = totalsY - SP_SM + Math.round((totalBandH - capH(T_TOTAL)) / 2)
  drawText("TOTAL",                 TOTALS_LBL_X, totalBaseline, { size: T_TOTAL, bold: true, align: "right" })
  drawText(`£ ${fmtNumber(total)}`, TOTALS_VAL_X, totalBaseline, { size: T_TOTAL, bold: true, align: "right" })

  // ── SECTION 6: Footer ─────────────────────────────────────────────────────
  //
  // The footer is always at FOOTER_Y from the page bottom, independent of
  // content length. Four items distributed in thirds across content width.

  drawHRule(FOOTER_RULE)

  const footerItems: Array<{ text: string; x: number; align: "left" | "right" | "center" }> = [
    { text: COMPANY.name,                               x: MARGIN_L,                              align: "left"   },
    { text: COMPANY.addressLines[1].replace(/\.$/, ""), x: (MARGIN_L + MARGIN_R) / 2,             align: "center" },
    { text: `T: ${COMPANY.phone}  ·  ${COMPANY.email}`, x: MARGIN_R,                              align: "right"  },
  ]

  for (const item of footerItems) {
    if (item.align === "center") {
      const font = fontRegular
      const w = font.widthOfTextAtSize(item.text, T_FOOTER)
      page.drawText(item.text, {
        x: item.x - w / 2,
        y: FOOTER_Y,
        size: T_FOOTER,
        font,
        color: LABEL_C,
      })
    } else {
      const maxW = CONTENT_W * 0.38
      const displayed = item.align === "left"
        ? truncate(item.text, maxW, T_FOOTER)
        : item.text
      drawText(displayed, item.x, FOOTER_Y, { size: T_FOOTER, color: LABEL_C, align: item.align })
    }
  }

  const pdfBytes = await doc.save()
  const filename = data.filename?.trim()
    || `${data.quotationNumber.replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf`
  return { pdfBytes, filename }
}

/** Load a persisted quote and render the shared quotation PDF. */
export async function buildQuotePdfBuffer(
  id: string
): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  const data = await mapQuoteRecordToQuotationPdfData(id)
  return buildQuotePdfFromPayload(data)
}

export async function generateQuotePdf(id: string): Promise<{ pdfPath: string }> {
  const { pdfBytes, filename } = await buildQuotePdfBuffer(id)

  const pdfPath = quotePdfDownloadUrl(id)
  await quoteService.updatePdfPath(id, pdfPath)

  const quote = await quoteService.findUnique(id)
  if (quote) setCachedQuotePdf(id, quote.updatedAt, pdfBytes, filename)

  return { pdfPath }
}
