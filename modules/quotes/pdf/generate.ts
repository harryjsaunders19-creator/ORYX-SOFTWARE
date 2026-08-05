/**
 * Quote PDF generation — extracted from the API route so it can run
 * in the background via next/server `after()`.
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

// ── Spacing scale (4-pt grid) ─────────────────────────────────────────────────
const SP_XS  = 4
const SP_SM  = 8
const SP_MD  = 12
const SP_LG  = 16
const SP_XL  = 24
/** Gap between major sections (~8–9 mm). */
const SP_SECTION = 24

// ── Typography scale (points) — fewer sizes, clearer hierarchy ────────────────
const T_QUOT     = 40    // QUOTE title (hero)
const T_CO       = 18    // company name
const T_HEAD     = 10    // black section header labels
const T_BODY     = 10    // body / table / customer / site
const T_META_LBL = 8     // metadata labels
const T_META_VAL = 10    // metadata values
const T_QUOTE_NO = 12    // quote number in meta — more prominent
const T_DETAIL   = 9     // company detail lines
const T_TERMS    = 9     // terms text
const T_TOTAL    = 14    // TOTAL row
const T_FOOTER   = 8     // footer

// Inter proportional metrics (approximate)
const CAP = 0.72   // cap-height / em
const DSC = 0.21   // descender depth / em

// Convenience: rounds size × ratio to nearest point
const capH = (size: number) => Math.round(size * CAP)
const dscH = (size: number) => Math.round(size * DSC)

// Line step helpers — slightly increased leading for print readability
const STEP_DETAIL = Math.round(T_DETAIL  * 1.55)
const STEP_META   = 18
const STEP_BODY   = Math.round(T_BODY    * 1.6)
const STEP_TERMS  = Math.round(T_TERMS   * 1.65)

// ── Monochrome palette ────────────────────────────────────────────────────────
const INK      = rgb(0.051, 0.051, 0.051)
const CHARCOAL = rgb(0.165, 0.165, 0.165)
const WHITE    = rgb(1, 1, 1)
const RULE_C   = rgb(0.82, 0.82, 0.82)     // lighter 1pt rules
const ROW_ALT  = rgb(0.975, 0.975, 0.975)  // subtler zebra
const TOTAL_BG = rgb(0.92, 0.92, 0.92)
const LABEL_C  = rgb(0.40, 0.40, 0.40)

/** Uniform border / rule thickness (1 pt). */
const BORDER_W = 1

// ── Table column widths (proportional) ───────────────────────────────────────
// Description 60 % | Purchase Order 18 % | VAT 8 % | Amount 14 %
const COL_DESC_X  = MARGIN_L
const COL_PO_X    = Math.round(MARGIN_L + CONTENT_W * 0.60)   // ≈ 348
const COL_VAT_X   = Math.round(COL_PO_X  + CONTENT_W * 0.18)  // ≈ 439
const COL_AMT_END = MARGIN_R

const CELL_PAD       = 12                                       // horizontal + vertical cell padding
const DESC_W         = COL_PO_X - COL_DESC_X - CELL_PAD * 2

const TABLE_HDR_H    = 30   // charcoal header band height (matches section headers)
const TABLE_ROW_H    = 32   // minimum data row height
const TABLE_ROW_STEP = STEP_BODY

// Reserve this many points below the last table row for totals + terms + footer
const FOOTER_RES = 270
const PAGE_SAFE  = 40

// ── Header column widths ──────────────────────────────────────────────────────
const LOGO_W      = 92.8
const LOGO_H      = 56.9
const QUOT_COL_W  = 200      // fixed right-column width for QUOTE + meta
const CO_X        = MARGIN_L + LOGO_W + SP_LG + SP_SM   // breathing room between logo and company text
const QUOT_COL_X  = MARGIN_R - QUOT_COL_W               // right column start ≈ 351

// Meta alignment: labels right-align to META_LBL_X, values right-align to MARGIN_R
// Leave enough gap for a prominent quote number (T_QUOTE_NO).
const META_LBL_X  = MARGIN_R - 118

// Company detail lines must not invade the right meta column
const DETAIL_MAX_W = QUOT_COL_X - CO_X - SP_MD

// ── Page layout anchor ────────────────────────────────────────────────────────
const CONTENT_TOP = PAGE_HEIGHT - 56   // slightly more top whitespace
const FOOTER_Y    = 44
const FOOTER_RULE = FOOTER_Y + SP_LG

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
export async function buildQuotePdfBuffer(
  id: string
): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  const quote = await quoteService.findUnique(id)
  if (!quote) throw new Error("Quote not found")

  const preparedBy = quote.createdBy

  const [client, realLineItems] = await Promise.all([
    quote.clientId ? clientService.findUnique(quote.clientId) : Promise.resolve(null),
    quoteService.findLineItemsForQuote(quote.id),
  ])

  const customerId = client?.accountCode ?? null
  const lineItems = realLineItems.length
    ? realLineItems.map(li => ({
        description:    li.description,
        amount:         li.amount,
        vatApplicable:  li.vatApplicable === 1,
      }))
    : [{ description: quote.description, amount: quote.quoteValue, vatApplicable: true }]

  const subtotal = lineItems.reduce((s, li) => s + li.amount, 0)
  const taxable  = lineItems.filter(li => li.vatApplicable).reduce((s, li) => s + li.amount, 0)
  const vatDue   = quote.vatRate != null ? taxable * (quote.vatRate / 100) : 0
  const total    = quote.vatRate != null ? subtotal + vatDue : subtotal

  // ── PDF document + assets ─────────────────────────────────────────────────
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

  const [regularBytes, boldBytes] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf")),
  ])
  const fontRegular = await doc.embedFont(regularBytes)
  const fontBold    = await doc.embedFont(boldBytes)

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
   * Draw a single text line. Returns the y for the NEXT line.
   * step defaults to size × 1.5.
   */
  const drawLine = (
    text: string,
    x: number,
    baselineY: number,
    opts: DrawOpts & { step?: number }
  ): number => {
    const { step = Math.round(opts.size * 1.5), ...rest } = opts
    drawText(text, x, baselineY, rest)
    return baselineY - step
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
   * Black section header band — identical style for CUSTOMER / SITE / TERMS / table.
   * Returns the y at the bottom of the band (content starts below + padding).
   */
  const drawBlackHeader = (label: string, x: number, topY: number, width: number): number => {
    const bandBottom = topY - TABLE_HDR_H
    page.drawRectangle({
      x, y: bandBottom, width, height: TABLE_HDR_H, color: CHARCOAL,
    })
    const baseline = topY - TABLE_HDR_H + Math.round((TABLE_HDR_H - capH(T_HEAD)) / 2)
    // Light letter-spacing via per-character draw
    const gap = 0.55
    let cx = x + CELL_PAD
    for (const ch of label.split("")) {
      page.drawText(ch, {
        x: cx, y: baseline, size: T_HEAD, font: fontBold, color: WHITE,
      })
      cx += fontBold.widthOfTextAtSize(ch, T_HEAD) + gap
    }
    return bandBottom
  }

  /**
   * Draw the charcoal table header band and return the y of the first data row.
   */
  const drawTableHeader = (p: typeof page, topY: number): number => {
    p.drawRectangle({
      x: MARGIN_L, y: topY - TABLE_HDR_H, width: CONTENT_W, height: TABLE_HDR_H, color: CHARCOAL,
    })
    const baseline = topY - TABLE_HDR_H + Math.round((TABLE_HDR_H - capH(T_HEAD)) / 2)
    const hdr = (text: string, x: number, align: "left" | "right" = "left") => {
      const w = fontBold.widthOfTextAtSize(text, T_HEAD)
      p.drawText(text, {
        x: align === "right" ? x - w : x,
        y: baseline,
        size: T_HEAD,
        font: fontBold,
        color: WHITE,
      })
    }
    hdr("DESCRIPTION",    COL_DESC_X + CELL_PAD)
    // Right-align within the PO cell end so the label can't overlap VAT
    hdr("PURCHASE ORDER", COL_VAT_X - CELL_PAD, "right")
    hdr("VAT",            COL_VAT_X  + CELL_PAD)
    hdr("AMOUNT",         COL_AMT_END - CELL_PAD, "right")
    return topY - TABLE_HDR_H
  }

  // ── SECTION 1: Header (three independent columns) ─────────────────────────
  //
  // Each column is drawn from CONTENT_TOP downward independently.
  // The header ends at min(col1End, col2End, col3End).
  //
  //  Col 1: Logo
  //  Col 2: Company name + detail lines
  //  Col 3: QUOTATION title (36pt) + meta rows

  // Column 1 — Logo
  // pdf-lib drawImage: y = bottom-left corner
  page.drawImage(logoImage, {
    x: MARGIN_L, y: CONTENT_TOP - LOGO_H, width: LOGO_W, height: LOGO_H,
  })
  const col1End = CONTENT_TOP - LOGO_H   // visual bottom of logo

  // Column 3 — QUOTE + meta (drawn before col 2 so col2 can clear it)
  const quotBaseline = CONTENT_TOP - capH(T_QUOT)
  drawText("QUOTE", MARGIN_R, quotBaseline, { size: T_QUOT, bold: true, align: "right" })

  const metaRows: [string, string, number?][] = [
    ["DATE",        fmtDate(quote.quoteDate)],
    ["QUOTE #",     quote.quoteNumber, T_QUOTE_NO],
    ["CUSTOMER ID", customerId ?? "—"],
    ["VALID UNTIL", fmtDate(quote.expiryDate)],
  ]
  // First meta row clears QUOTE descender — slightly more breathing room
  let metaY = quotBaseline - dscH(T_QUOT) - SP_LG
  for (const [label, value, valueSize] of metaRows) {
    drawText(label, META_LBL_X, metaY, { size: T_META_LBL, align: "right", color: LABEL_C })
    drawText(value, MARGIN_R,   metaY, {
      size: valueSize ?? T_META_VAL,
      bold: true,
      align: "right",
    })
    metaY -= STEP_META
  }
  // Visual bottom of last meta row
  const col3End = metaY + STEP_META - dscH(T_META_VAL)

  // Column 2 — Company name + address + phone + prepared-by
  // Align company name near the logo top for cleaner letterhead balance
  const coNameBaseline  = CONTENT_TOP - capH(T_CO)

  drawText(COMPANY.name, CO_X, coNameBaseline, { size: T_CO, bold: true })

  const details: string[] = [
    COMPANY.addressLines[0],
    COMPANY.addressLines[1],
    `T: ${COMPANY.phone}`,
    `Prepared by: ${preparedBy}`,
  ]
  // First detail: below company name descender with comfortable gap
  let detailY = coNameBaseline - dscH(T_CO) - SP_MD
  for (const line of details) {
    drawText(truncate(line, DETAIL_MAX_W, T_DETAIL), CO_X, detailY, { size: T_DETAIL, color: LABEL_C })
    detailY -= STEP_DETAIL
  }
  const col2End = detailY + STEP_DETAIL - dscH(T_DETAIL)

  // Header ends at the lowest (smallest y) of all three columns
  const headerEnd = Math.min(col1End, col2End, col3End)

  // ── Separator after header
  const hdrRuleY = headerEnd - SP_SECTION
  drawHRule(hdrRuleY)

  // ── SECTION 2: Customer / Site (two equal columns) ────────────────────────
  const halfW    = (CONTENT_W - SP_LG) / 2
  const siteColX = MARGIN_L + halfW + SP_LG

  const custHeadY = hdrRuleY - SP_SECTION

  // Identical black headers for both columns
  const custBandBottom = drawBlackHeader("CUSTOMER", MARGIN_L, custHeadY, halfW)
  const siteBandBottom = drawBlackHeader("SITE",     siteColX, custHeadY, halfW)

  // Internal padding below black headers before content
  let custY = custBandBottom - SP_LG
  let siteY = siteBandBottom - SP_LG

  // Customer company name — wraps naturally
  custY = drawWrapped(quote.clientCompany, MARGIN_L + SP_MD, custY, halfW - SP_LG, {
    size: T_BODY, step: STEP_BODY, bold: true,
  })
  // Contact line — truncated (single line)
  if (quote.contactName) {
    drawText(
      truncate(`Contact — ${quote.contactName}`, halfW - SP_LG, T_BODY),
      MARGIN_L + SP_MD, custY, { size: T_BODY, color: LABEL_C }
    )
    custY -= STEP_BODY
  }

  // Site address — wraps naturally
  siteY = drawWrapped(quote.address, siteColX + SP_MD, siteY, halfW - SP_LG, {
    size: T_BODY, step: STEP_BODY,
  })

  // Extra bottom padding inside the customer/site area
  custY -= SP_MD
  siteY -= SP_MD

  // Section ends at whichever column is taller
  const csEnd    = Math.min(custY, siteY)
  const secRuleY = csEnd - SP_SECTION
  drawHRule(secRuleY)

  // ── SECTION 3: Item Table ─────────────────────────────────────────────────
  let rowTop            = drawTableHeader(page, secRuleY - SP_SECTION)
  let paginationOccurred = false
  let bandIndex         = 0

  for (const item of lineItems) {
    const descLines = wrapText(item.description, fontRegular, T_BODY, DESC_W)
    const rowH      = Math.max(TABLE_ROW_H, descLines.length * TABLE_ROW_STEP + CELL_PAD * 2)

    // Page overflow → new page
    if (rowTop - rowH < PAGE_SAFE + FOOTER_RES) {
      drawText("Continued on next page…", MARGIN_L, rowTop - SP_MD, {
        size: T_DETAIL, color: LABEL_C,
      })
      page   = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      rowTop = drawTableHeader(page, PAGE_HEIGHT - SP_LG * 3)
      drawText(
        `${COMPANY.name} — Quote ${quote.quoteNumber} (continued)`,
        MARGIN_L, PAGE_HEIGHT - SP_LG, { size: T_DETAIL, color: LABEL_C }
      )
      paginationOccurred = true
      bandIndex          = 0
    }

    // Alternating row tint (subtle)
    if (bandIndex % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_L, y: rowTop - rowH, width: CONTENT_W, height: rowH, color: ROW_ALT,
      })
    }

    // Description (wraps) — top-padded
    const textBase = rowTop - CELL_PAD
    let   lineBase = textBase
    for (const line of descLines) {
      drawText(line, COL_DESC_X + CELL_PAD, lineBase, { size: T_BODY })
      lineBase -= TABLE_ROW_STEP
    }
    // VAT indicator
    if (item.vatApplicable) {
      drawText("X", COL_VAT_X + CELL_PAD + 2, textBase, { size: T_BODY })
    }
    // Amount right-aligned with consistent cell padding
    drawText(fmtNumber(item.amount), COL_AMT_END - CELL_PAD, textBase, {
      size: T_BODY, align: "right",
    })

    // Bottom rule — uniform 1pt
    page.drawLine({
      start: { x: MARGIN_L, y: rowTop - rowH },
      end:   { x: MARGIN_R, y: rowTop - rowH },
      thickness: BORDER_W,
      color: RULE_C,
    })

    rowTop    -= rowH
    bandIndex++
  }

  // Filler rows — keep visual rhythm on short quotes
  if (!paginationOccurred) {
    while (bandIndex < 8 && rowTop - TABLE_ROW_H >= PAGE_SAFE + FOOTER_RES) {
      if (bandIndex % 2 === 1) {
        page.drawRectangle({
          x: MARGIN_L, y: rowTop - TABLE_ROW_H,
          width: CONTENT_W, height: TABLE_ROW_H,
          color: ROW_ALT,
        })
      }
      page.drawLine({
        start: { x: MARGIN_L, y: rowTop - TABLE_ROW_H },
        end:   { x: MARGIN_R, y: rowTop - TABLE_ROW_H },
        thickness: BORDER_W, color: RULE_C,
      })
      rowTop -= TABLE_ROW_H
      bandIndex++
    }
  }

  const tableBottom = rowTop

  // ── SECTION 4: Terms and Conditions (lower left) ──────────────────────────
  //
  // Terms occupy the left ~55 % of content width.
  // Totals occupy the right ~45 % — x ranges never overlap.

  const TERMS_COL_W = Math.round(CONTENT_W * 0.54) - SP_SM
  const TERMS_RIGHT = MARGIN_L + TERMS_COL_W

  let termsY     = tableBottom - SP_SECTION
  const tBandBottom = drawBlackHeader("TERMS AND CONDITIONS", MARGIN_L, termsY, TERMS_COL_W)
  termsY         = tBandBottom - SP_LG - SP_XS   // internal padding below black header

  for (let i = 0; i < TERMS.length; i++) {
    termsY = drawWrapped(
      `${i + 1}.  ${TERMS[i]}`,
      MARGIN_L + SP_MD, termsY,
      TERMS_COL_W - SP_LG,
      { size: T_TERMS, color: LABEL_C, step: STEP_TERMS }
    )
    termsY -= SP_MD   // comfortable gap between numbered items
  }

  // ── SECTION 5: Totals (lower right) ───────────────────────────────────────
  //
  // Labels right-align to TOTALS_LBL_X.
  // Values right-align to MARGIN_R.
  // The background of the TOTAL row starts at TERMS_RIGHT + SP_LG so it
  // never overlaps the terms text.

  const TOTALS_LBL_X = Math.round(MARGIN_R - CONTENT_W * 0.27)

  let totalsY = tableBottom - SP_SECTION

  if (quote.vatRate != null) {
    const subRows: [string, string][] = [
      ["Subtotal", fmtNumber(subtotal)],
      ["Taxable",  fmtNumber(taxable)],
      ["VAT Rate", `${quote.vatRate.toFixed(2)}%`],
      ["VAT Due",  fmtNumber(vatDue)],
    ]
    for (const [label, value] of subRows) {
      drawText(label, TOTALS_LBL_X, totalsY, { size: T_BODY, align: "right", color: LABEL_C })
      drawText(value, MARGIN_R,     totalsY, { size: T_BODY, align: "right" })
      totalsY -= SP_LG + SP_SM   // ~24 pt step — clearer vertical rhythm
    }
  }

  // TOTAL row: extra gap above, stronger band, bold T_TOTAL text
  totalsY -= SP_MD
  const totalBandX = Math.max(TERMS_RIGHT + SP_LG, TOTALS_LBL_X - SP_XL)
  const totalBandH = SP_XL + SP_MD   // ~36 pt band
  page.drawRectangle({
    x: totalBandX, y: totalsY - SP_SM,
    width: MARGIN_R - totalBandX,
    height: totalBandH,
    color: TOTAL_BG,
  })
  drawText("TOTAL",                TOTALS_LBL_X, totalsY + SP_SM, { size: T_TOTAL, bold: true, align: "right" })
  drawText(`£ ${fmtNumber(total)}`, MARGIN_R,    totalsY + SP_SM, { size: T_TOTAL, bold: true, align: "right" })

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
