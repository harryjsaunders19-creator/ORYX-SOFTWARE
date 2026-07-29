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
const SP_XL  = 20

// ── Typography scale (points) ─────────────────────────────────────────────────
const T_QUOT     = 36    // QUOTATION heading
const T_CO       = 22    // company name
const T_HEAD     = 11    // section labels
const T_BODY     = 10    // body / table
const T_META_LBL = 8     // metadata labels
const T_META_VAL = 9.5   // metadata values
const T_DETAIL   = 8.5   // company detail lines
const T_TERMS    = 9     // terms text
const T_TOTAL    = 13    // TOTAL row
const T_FOOTER   = 8.5   // footer

// Liberation Sans proportional metrics
const CAP = 0.72   // cap-height / em
const DSC = 0.21   // descender depth / em

// Convenience: rounds size × ratio to nearest point
const capH = (size: number) => Math.round(size * CAP)
const dscH = (size: number) => Math.round(size * DSC)

// Line step helpers — size × leading, rounded to whole points
const STEP_DETAIL = Math.round(T_DETAIL  * 1.45)   // 12 pt
const STEP_META   = 16                              // meta rows (explicit)
const STEP_BODY   = Math.round(T_BODY    * 1.5)    // 15 pt
const STEP_TERMS  = Math.round(T_TERMS   * 1.55)   // 14 pt

// ── Monochrome palette ────────────────────────────────────────────────────────
const INK      = rgb(0.051, 0.051, 0.051)
const CHARCOAL = rgb(0.165, 0.165, 0.165)
const WHITE    = rgb(1, 1, 1)
const RULE_C   = rgb(0.784, 0.784, 0.784)
const ROW_ALT  = rgb(0.961, 0.961, 0.961)
const TOTAL_BG = rgb(0.914, 0.914, 0.914)
const LABEL_C  = rgb(0.424, 0.424, 0.424)

// ── Table column widths (proportional) ───────────────────────────────────────
// Description 60 % | Purchase Order 18 % | VAT 8 % | Amount 14 %
const COL_DESC_X  = MARGIN_L
const COL_PO_X    = Math.round(MARGIN_L + CONTENT_W * 0.60)   // ≈ 348
const COL_VAT_X   = Math.round(COL_PO_X  + CONTENT_W * 0.18)  // ≈ 439
const COL_AMT_END = MARGIN_R

const CELL_PAD       = 10                                       // horizontal cell padding
const DESC_W         = COL_PO_X - COL_DESC_X - CELL_PAD        // wrap width ≈ 294

const TABLE_HDR_H    = 24   // charcoal header band height
const TABLE_ROW_H    = 26   // minimum data row height
const TABLE_ROW_STEP = STEP_BODY

// Reserve this many points below the last table row for totals + terms + footer
const FOOTER_RES = 250
const PAGE_SAFE  = 40

// ── Header column widths ──────────────────────────────────────────────────────
const LOGO_W      = 92.8
const LOGO_H      = 56.9
const QUOT_COL_W  = 200      // fixed right-column width for QUOTATION + meta
const CO_X        = MARGIN_L + LOGO_W + SP_LG           // company text left ≈ 152
const CO_COL_W    = MARGIN_R - QUOT_COL_W - SP_LG - CO_X // middle column width ≈ 154
const QUOT_COL_X  = MARGIN_R - QUOT_COL_W               // right column start ≈ 351

// Meta alignment: labels right-align to META_LBL_X, values right-align to MARGIN_R
const META_LBL_X  = MARGIN_R - 82                       // ≈ 469

// Company detail lines must not invade the right meta column
const DETAIL_MAX_W = QUOT_COL_X - CO_X - SP_MD          // ≈ 187

// ── Page layout anchor ────────────────────────────────────────────────────────
const CONTENT_TOP = PAGE_HEIGHT - 52   // ≈ 789.89 (≈ 18 mm top margin)
const FOOTER_Y    = 48
const FOOTER_RULE = FOOTER_Y + SP_MD

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
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf")),
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
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: RULE_C })

  /**
   * Draw a section heading (T_HEAD bold) + thin rule below.
   * Returns the y of the rule (caller should add SP_MD before content).
   */
  const drawSectionHead = (label: string, x: number, topY: number, colW: number): number => {
    drawText(label, x, topY, { size: T_HEAD, bold: true })
    const ruleY = topY - dscH(T_HEAD) - SP_XS
    page.drawLine({
      start: { x, y: ruleY },
      end:   { x: x + colW, y: ruleY },
      thickness: 0.5,
      color: RULE_C,
    })
    return ruleY
  }

  /**
   * Draw the charcoal table header band and return the y of the first data row.
   */
  const drawTableHeader = (p: typeof page, topY: number): number => {
    p.drawRectangle({
      x: MARGIN_L, y: topY - TABLE_HDR_H, width: CONTENT_W, height: TABLE_HDR_H, color: CHARCOAL,
    })
    // Vertically centre T_BODY text in the band
    const baseline = topY - TABLE_HDR_H + Math.round((TABLE_HDR_H - capH(T_BODY)) / 2)
    const hdr = (text: string, x: number, align: "left" | "right" = "left") => {
      const w = fontBold.widthOfTextAtSize(text, T_BODY)
      p.drawText(text, {
        x: align === "right" ? x - w : x,
        y: baseline,
        size: T_BODY,
        font: fontBold,
        color: WHITE,
      })
    }
    hdr("DESCRIPTION",    COL_DESC_X + CELL_PAD)
    hdr("PURCHASE ORDER", COL_PO_X   + CELL_PAD)
    hdr("VAT",            COL_VAT_X  + CELL_PAD)
    hdr("AMOUNT",         COL_AMT_END,            "right")
    return topY - TABLE_HDR_H   // first data row starts here
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

  // Column 3 — QUOTATION + meta (drawn before col 2 so col2 can clear it)
  // QUOTATION: cap top aligns with CONTENT_TOP
  const quotBaseline = CONTENT_TOP - capH(T_QUOT)
  drawText("QUOTATION", MARGIN_R, quotBaseline, { size: T_QUOT, bold: true, align: "right" })

  const metaRows: [string, string][] = [
    ["DATE",        fmtDate(quote.quoteDate)],
    ["QUOTE #",     quote.quoteNumber],
    ["CUSTOMER ID", customerId ?? "—"],
    ["VALID UNTIL", fmtDate(quote.expiryDate)],
  ]
  // First meta row clears QUOTATION descender
  let metaY = quotBaseline - dscH(T_QUOT) - SP_MD
  for (const [label, value] of metaRows) {
    drawText(label, META_LBL_X, metaY, { size: T_META_LBL, align: "right", color: LABEL_C })
    drawText(value, MARGIN_R,   metaY, { size: T_META_VAL, bold: true,      align: "right" })
    metaY -= STEP_META
  }
  // Visual bottom of last meta row
  const col3End = metaY + STEP_META - dscH(T_META_VAL)

  // Column 2 — Company name + address + phone + prepared-by
  // Company name: cap top placed safely below QUOTATION descender
  const quotDescBottom  = quotBaseline - dscH(T_QUOT)
  const coNameCapTop    = quotDescBottom - SP_SM   // 8 pt gap below QUOTATION descender
  const coNameBaseline  = coNameCapTop - capH(T_CO)

  drawText(COMPANY.name, CO_X, coNameBaseline, { size: T_CO, bold: true })

  const details: string[] = [
    COMPANY.addressLines[0],
    COMPANY.addressLines[1],
    `T: ${COMPANY.phone}`,
    `Prepared by: ${preparedBy}`,
  ]
  // First detail: below company name descender
  let detailY = coNameBaseline - dscH(T_CO) - SP_LG
  for (const line of details) {
    drawText(truncate(line, DETAIL_MAX_W, T_DETAIL), CO_X, detailY, { size: T_DETAIL, color: LABEL_C })
    detailY -= STEP_DETAIL
  }
  const col2End = detailY + STEP_DETAIL - dscH(T_DETAIL)

  // Header ends at the lowest (smallest y) of all three columns
  const headerEnd = Math.min(col1End, col2End, col3End)

  // ── Separator after header
  const hdrRuleY = headerEnd - SP_MD
  drawHRule(hdrRuleY)

  // ── SECTION 2: Customer / Site (two equal columns) ────────────────────────
  const halfW    = (CONTENT_W - SP_LG) / 2   // ≈ 245.75 pt
  const siteColX = MARGIN_L + halfW + SP_LG

  const custHeadY = hdrRuleY - SP_XL   // 20 pt breathing room below rule

  // Both column headings at the same y
  const custRuleY = drawSectionHead("CUSTOMER", MARGIN_L, custHeadY, halfW)
  const siteRuleY = drawSectionHead("SITE",     siteColX, custHeadY, halfW)

  // Content starts immediately below each heading rule + SP_MD
  let custY = custRuleY - SP_MD
  let siteY = siteRuleY - SP_MD

  // Customer company name — wraps naturally
  custY = drawWrapped(quote.clientCompany, MARGIN_L, custY, halfW - SP_SM, {
    size: T_BODY, step: STEP_BODY,
  })
  // Contact line — truncated (single line)
  if (quote.contactName) {
    drawText(
      truncate(`Contact — ${quote.contactName}`, halfW - SP_SM, T_BODY - 1),
      MARGIN_L, custY, { size: T_BODY - 1, color: LABEL_C }
    )
    custY -= STEP_BODY
  }

  // Site address — wraps naturally
  siteY = drawWrapped(quote.address, siteColX, siteY, halfW - SP_SM, {
    size: T_BODY, step: STEP_BODY,
  })

  // Section ends at whichever column is taller
  const csEnd    = Math.min(custY, siteY)
  const secRuleY = csEnd - SP_SM
  drawHRule(secRuleY)

  // ── SECTION 3: Item Table ─────────────────────────────────────────────────
  let rowTop            = drawTableHeader(page, secRuleY - SP_MD)
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

    // Alternating row tint
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
    // VAT indicator centred in its column
    if (item.vatApplicable) {
      drawText("X", COL_VAT_X + CELL_PAD + 2, textBase, { size: T_BODY })
    }
    // Amount right-aligned
    drawText(fmtNumber(item.amount), COL_AMT_END - CELL_PAD, textBase, {
      size: T_BODY, align: "right",
    })

    // Bottom rule
    page.drawLine({
      start: { x: MARGIN_L, y: rowTop - rowH },
      end:   { x: MARGIN_R, y: rowTop - rowH },
      thickness: 0.5,
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
        thickness: 0.5, color: RULE_C,
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

  const TERMS_COL_W = Math.round(CONTENT_W * 0.54) - SP_SM   // ≈ 266 pt
  const TERMS_RIGHT = MARGIN_L + TERMS_COL_W                   // ≈ 310

  let termsY     = tableBottom - SP_MD
  const tRuleY   = drawSectionHead("TERMS AND CONDITIONS", MARGIN_L, termsY, TERMS_COL_W)
  termsY         = tRuleY - SP_LG   // comfortable gap below heading rule

  for (let i = 0; i < TERMS.length; i++) {
    termsY = drawWrapped(
      `${i + 1}.  ${TERMS[i]}`,
      MARGIN_L, termsY,
      TERMS_COL_W - SP_SM,
      { size: T_TERMS, color: LABEL_C, step: STEP_TERMS }
    )
    termsY -= SP_SM   // extra gap between numbered items
  }

  // ── SECTION 5: Totals (lower right) ───────────────────────────────────────
  //
  // Labels right-align to TOTALS_LBL_X.
  // Values right-align to MARGIN_R.
  // The background of the TOTAL row starts at TERMS_RIGHT + SP_LG so it
  // never overlaps the terms text.

  const TOTALS_LBL_X = Math.round(MARGIN_R - CONTENT_W * 0.27)   // ≈ 414

  let totalsY = tableBottom - SP_XL   // 20 pt below table, slightly offset from terms

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
      totalsY -= SP_LG + SP_XS   // 20 pt step — comfortable spacing
    }
  }

  // TOTAL row: 8 pt above the label, grey band, bold T_TOTAL text
  totalsY -= SP_SM   // extra gap above TOTAL
  const totalBandX = Math.max(TERMS_RIGHT + SP_LG, TOTALS_LBL_X - SP_XL)
  const totalBandH = SP_XL + SP_SM   // 28 pt band
  page.drawRectangle({
    x: totalBandX, y: totalsY - SP_XS,
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

  const footerColW = CONTENT_W / 3
  const footerMaxW = footerColW - SP_SM

  const footerItems: Array<{ text: string; x: number; align: "left" | "right" }> = [
    { text: COMPANY.name,                               x: MARGIN_L,                  align: "left"  },
    { text: COMPANY.addressLines[1].replace(/\.$/, ""), x: MARGIN_L + footerColW,     align: "left"  },
    { text: `T: ${COMPANY.phone}`,                      x: MARGIN_L + footerColW * 2, align: "left"  },
    { text: `E: ${COMPANY.email}`,                      x: MARGIN_R,                  align: "right" },
  ]

  for (const item of footerItems) {
    const displayed = item.align === "left"
      ? truncate(item.text, footerMaxW, T_FOOTER)
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
