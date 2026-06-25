/**
 * POST /api/quotes/[id]/pdf
 *
 * Rebuilt to match a real reference quotation template pixel-for-pixel
 * (coordinates extracted via pdfplumber against the supplied PDF — see
 * PROJECT_OVERVIEW.md for the full measurement table). Still pdf-lib —
 * the existing approach was never the problem, the layout code was.
 *
 * Fonts: the reference uses Arial (headings) and Trebuchet MS (body) —
 * neither is legally embeddable here. Liberation Sans (SIL Open Font
 * License, metrically identical to Arial — that's its whole purpose) is
 * used throughout instead. See public/fonts/.
 *
 * Logo: losslessly extracted from the reference PDF's own embedded image
 * (their own company logo, reused in their own internal software) —
 * public/branding/oryx-logo.jpg.
 *
 * Body: none required — every value comes from the stored quote record.
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { quoteDb, quoteLineItemDb, clientDb } from "@/lib/db"
import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { format } from "date-fns"
import fs from "fs/promises"
import path from "path"

const PAGE_WIDTH  = 595.28   // A4 in points
const PAGE_HEIGHT = 841.89
const MARGIN_L    = 43.7
const MARGIN_R    = 551.2
const CONTENT_W   = MARGIN_R - MARGIN_L

const INK    = rgb(0, 0, 0)
const WHITE  = rgb(1, 1, 1)
const GREY_BAND   = rgb(0.949, 0.949, 0.949)   // table row banding
const TOTAL_TINT  = rgb(0.824, 0.851, 0.925)   // TOTAL row highlight
const BORDER_GREY = rgb(0.502, 0.502, 0.502)   // metadata box border
const BORDER_INK  = rgb(0, 0, 0)               // table/terms box borders

// Company info is fixed (not per-quote data) — matches the reference's own
// letterhead exactly.
const COMPANY = {
  name: "ORYX Scaffold Design Ltd",
  addressLines: ["Little Woodlands, 61 Bath Road, Willsbridge.", "Bristol, BS30 6ES."],
  phone: "Phone: 0117 3290050",
  footerContactName: "Harry Saunders",
  footerEmail: "harry@oryxdesignltd.co.uk",
  footerMobile: "07712596936",
}

// Standard terms — company policy text, not quote-specific data, so kept as
// a constant here rather than a new per-quote database field. Edit this
// array to change the wording on every future quote PDF.
const TERMS = [
  "Customer will be billed after indicating acceptance of this quote.",
  "Payment will be due 21 days after the receipt of invoice.",
  "Please confirm acceptance of this quote in written form through email.",
  "Any further works or revisions after the submittal of the first design will be charged at £95.00 + VAT Per hour.",
]

/** Plain "1,234.56" formatting for table/totals cells — the reference
 *  never shows a currency symbol except once, beside the final TOTAL. */
function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  try { return format(new Date(d), "dd/MM/yyyy") } catch { return d }
}

function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  // Respect explicit line breaks the user typed (e.g. separate paragraphs
  // within one description) as hard breaks first — only then word-wrap
  // within each resulting segment. Splitting on /\s+/ across the whole
  // string before this fix silently collapsed every newline into a single
  // continuous paragraph, which a multi-line textarea makes easy to type
  // and lose without anyone noticing until the PDF comes out flattened.
  const paragraphs = text.split(/\n/)
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(""); continue }   // a blank line the user typed stays a blank line
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

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const { id } = await params
    const quote = quoteDb.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

    // The PDF's "Prepared by" line always shows the quote's real, persisted
    // creator (captured once at creation time — see POST /api/quotes) —
    // never a value supplied by whoever happens to be calling this route.
    // This route used to accept an optional `preparedBy` override in its
    // request body, and the frontend's "Generate PDF" button always sent
    // the *current* logged-in user's name as that override — meaning every
    // PDF showed whoever last clicked the button, not the quote's actual
    // creator, and that wrong value then got written back onto the quote
    // record itself (the quoteDb.update below used to persist it), making
    // the mistake stick even for later, unrelated regenerations. There is
    // no legitimate UI path that needs "prepared by" to differ from
    // "created by," so the simplest correct fix removes the override
    // entirely — and the request body along with it — rather than leaving
    // a mechanism that's easy to misuse again.
    const preparedBy = quote.createdBy

    const client = quote.clientId ? clientDb.findUnique(quote.clientId) : null
    const customerId = client?.accountCode ?? null

    // Line items: real ones if this quote has them, otherwise a single
    // line derived from the existing description+quoteValue — every quote
    // created before this feature existed renders exactly as it always
    // has, just inside the new layout.
    const realLineItems = quoteLineItemDb.findForQuote(quote.id)
    const lineItems = realLineItems.length
      ? realLineItems.map(li => ({ description: li.description, amount: li.amount, vatApplicable: li.vatApplicable === 1 }))
      : [{ description: quote.description, amount: quote.quoteValue, vatApplicable: true }]

    const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0)
    const taxable  = lineItems.filter(li => li.vatApplicable).reduce((sum, li) => sum + li.amount, 0)
    const vatDue   = quote.vatRate != null ? taxable * (quote.vatRate / 100) : 0
    const total    = quote.vatRate != null ? subtotal + vatDue : subtotal

    // ── Build the PDF ──────────────────────────────────────────────
    const doc = await PDFDocument.create()
    doc.registerFontkit(fontkit)
    let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    const [regularBytes, boldBytes] = await Promise.all([
      fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf")),
      fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf")),
    ])
    const fontRegular = await doc.embedFont(regularBytes)
    const fontBold     = await doc.embedFont(boldBytes)

    // Logo — embedded as-is, the company's own real logo image
    const logoBytes = await fs.readFile(path.join(process.cwd(), "public", "branding", "oryx-logo.jpg"))
    const logoImage = await doc.embedJpg(logoBytes)
    page.drawImage(logoImage, { x: 52.2, y: 748.29, width: 92.8, height: 56.9 })

    const drawText = (text: string, x: number, baselineY: number, opts: { size: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: "left" | "right" | "center"; maxWidth?: number }) => {
      const font = opts.bold ? fontBold : fontRegular
      let drawX = x
      if (opts.align === "right" && opts.maxWidth == null) {
        drawX = x - font.widthOfTextAtSize(text, opts.size)
      } else if (opts.align === "center" && opts.maxWidth != null) {
        drawX = x + (opts.maxWidth - font.widthOfTextAtSize(text, opts.size)) / 2
      }
      page.drawText(text, { x: drawX, y: baselineY, size: opts.size, font, color: opts.color ?? INK })
    }

    function drawSectionBar(label: string, topY: number, width: number) {
      const barH = 14.3
      page.drawRectangle({ x: MARGIN_L, y: topY - barH, width, height: barH, color: INK })
      drawText(label, 45.7, topY - barH + 3.1, { size: 11, bold: true, color: WHITE })
    }

    // ── Company name + QUOTE heading ──────────────────────────────
    drawText(COMPANY.name, 176.4, 756.09, { size: 20, bold: false })
    drawText("QUOTE", 546.4, 768.19, { size: 26, bold: true, align: "right" })

    // ── Left info block: address, phone, prepared by ──────────────
    let leftY = 728.39
    for (const line of COMPANY.addressLines) {
      drawText(line, 45.5, leftY, { size: 10 })
      leftY -= 13.6
    }
    drawText(COMPANY.phone, 45.5, leftY, { size: 10 }); leftY -= 13.6
    drawText(`Prepared by: ${preparedBy}`, 45.5, leftY, { size: 10 })

    // ── Right metadata box: DATE / QUOTE # / CUSTOMER ID / VALID UNTIL ─
    const metaRows: [string, string][] = [
      ["DATE", fmtDate(quote.quoteDate)],
      ["QUOTE #", quote.quoteNumber],
      ["CUSTOMER ID", customerId ?? "—"],
      ["VALID UNTIL", fmtDate(quote.expiryDate)],
    ]
    const metaBoxTop = 754.39, metaRowH = 13.6
    page.drawRectangle({ x: 471.8, y: metaBoxTop - metaRowH * 4, width: 79.4, height: metaRowH * 4, borderColor: BORDER_GREY, borderWidth: 1 })
    for (let i = 0; i < metaRows.length; i++) {
      const rowTopY = metaBoxTop - metaRowH * i
      if (i > 0) page.drawLine({ start: { x: 471.8, y: rowTopY }, end: { x: 551.2, y: rowTopY }, thickness: 1, color: BORDER_GREY })
      const baselineY = rowTopY - 10
      drawText(metaRows[i][0], 461.4, baselineY, { size: 10, align: "right" })
      drawText(metaRows[i][1], 538.2, baselineY, { size: 10, align: "right" })
    }

    function truncateToWidth(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string {
      if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
      let result = text
      while (result.length > 1 && font.widthOfTextAtSize(result + "…", size) > maxWidth) {
        result = result.slice(0, -1)
      }
      return result + "…"
    }

    // ── CUSTOMER section ────────────────────────────────────────────
    // Client company names can be arbitrarily long in practice — truncated
    // to one line rather than left to overflow past the page edge or into
    // the metadata box to the right.
    drawSectionBar("CUSTOMER", 672.59, 186.5)
    let custY = 646.39
    drawText(truncateToWidth(quote.clientCompany, fontRegular, 10, 250), 45.5, custY, { size: 10 }); custY -= 13.6
    if (quote.contactName) drawText(truncateToWidth(`Contact - ${quote.contactName}`, fontRegular, 10, 250), 45.5, custY, { size: 10 })

    // ── SITE section ────────────────────────────────────────────────
    // Both lines below are capped to one line each (truncated with an
    // ellipsis if too long) rather than allowed to wrap — this block sits
    // in a fixed-height slot directly above the table, which itself starts
    // at a fixed y position; an unpredictable second or third wrapped line
    // here would risk exactly the kind of overlap already found and fixed
    // once already in the terms/footer area. Nothing is lost: the full,
    // un-truncated description is still shown in the line-items table below
    // (in the single-derived-line-item fallback, that line literally is
    // quote.description, word-wrapped properly within a row that can grow).
    drawSectionBar("SITE", 617.69, 186.5)
    let siteY = 591.59
    drawText(truncateToWidth(quote.address, fontRegular, 10, 250), 45.5, siteY, { size: 10 }); siteY -= 13.6
    const sitePreview = quote.description.split("\n")[0]
    drawText(truncateToWidth(sitePreview, fontRegular, 10, 250), 45.5, siteY, { size: 10 })

    // ── Line items table ────────────────────────────────────────────
    // Real pagination: a row's height grows to fit however many lines its
    // description actually needs (no silent truncation), and if a page
    // runs out of room mid-table, a new page starts with the header row
    // repeated — totals/terms/footer are only drawn once, after the last
    // row, on whichever page that turns out to be.
    const colDescX = MARGIN_L, colVatDivider = 415.1, colAmountDivider = 471.7
    const descColWidth = colVatDivider - colDescX - 4
    const MIN_ROW_H = 27.1, LINE_H = 13.6
    const FOOTER_RESERVE = 270   // totals block + terms block + margin — must still fit below the last row on its page
    const PAGE_BOTTOM_SAFE = 40

    function drawTableHeader(p: typeof page, topY: number): number {
      const h = 14.3
      p.drawRectangle({ x: MARGIN_L, y: topY - h, width: CONTENT_W, height: h, color: INK })
      const baseline = topY - h + 4.3
      const draw = (text: string, x: number, opts: { align?: "right" } = {}) => {
        const w = fontBold.widthOfTextAtSize(text, 11)
        p.drawText(text, { x: opts.align === "right" ? x - w : x, y: baseline, size: 11, font: fontBold, color: WHITE })
      }
      draw("DESCRIPTION", 45.7)
      draw("Purchase Order", 408.4, { align: "right" })
      draw("VAT", 433.7)
      draw("AMOUNT", 487.9)
      return topY - h
    }

    let rowTop = drawTableHeader(page, 562.89)
    let paginationOccurred = false
    let bandIndex = 0   // for alternating grey bands, continues across page breaks for visual consistency

    for (const item of lineItems) {
      const descLines = wrapText(item.description, fontRegular, 10, descColWidth)
      const rowH = Math.max(MIN_ROW_H, descLines.length * LINE_H + 3)

      // Would this row (plus the space every table needs to reserve for
      // totals/terms/footer afterward) run off the bottom of the page?
      // This used to also require rowsDrawnOnThisPage > 0 — added on the
      // assumption that checking unconditionally could loop forever for a
      // single row too large to ever fit. That assumption was wrong: this
      // is a plain for-of over lineItems (bounded by its length), not a
      // retry loop, so there was never an actual infinite-loop risk — the
      // guard's only real effect was exempting an oversized *first* row of
      // any page from ever triggering a break at all. A single
      // pathologically long description as the only/first item had
      // nowhere to go and just overflowed straight through the terms box
      // into the footer, found by actually rendering that exact case.
      if (rowTop - rowH < PAGE_BOTTOM_SAFE + FOOTER_RESERVE) {
        drawText("Continued on next page…", MARGIN_L, rowTop - 14, { size: 9, color: BORDER_GREY })
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
        rowTop = drawTableHeader(page, PAGE_HEIGHT - 56)
        drawText(`${COMPANY.name} — Quote ${quote.quoteNumber} (continued)`, MARGIN_L, PAGE_HEIGHT - 40, { size: 9, color: BORDER_GREY })
        paginationOccurred = true
      }

      if (bandIndex % 2 === 0) {
        page.drawRectangle({ x: MARGIN_L, y: rowTop - rowH, width: CONTENT_W, height: rowH, color: GREY_BAND })
      }
      let lineBaseline = rowTop - 10
      for (const line of descLines) {
        drawText(line, 45.5, lineBaseline, { size: 10 })
        lineBaseline -= LINE_H
      }
      // align:"center" with maxWidth:0 centers the glyph on the x
      // coordinate itself (a single point, not a cell) — used here since
      // the VAT column's "X" mark has no real cell padding to center
      // within, just a column midpoint to sit on.
      if (item.vatApplicable) drawText("X", 444.3, rowTop - 10, { size: 10, align: "center", maxWidth: 0 })
      drawText(fmtNumber(item.amount), 545.1, rowTop - 10, { size: 10, align: "right" })

      rowTop -= rowH
      bandIndex++
    }

    // Pad with empty banded rows up to the reference's minimum 8, but only
    // when nothing paginated — an overflow page ending mid-table shouldn't
    // be padded with empty rows it doesn't need. Critically, padding stops
    // as soon as it would run into the space reserved for totals/terms/
    // footer below — the loop used to blindly pad to exactly 8 regardless
    // of how much vertical space real content had already used, which let
    // a table with one or two unusually tall rows (e.g. a long multi-
    // paragraph description) push the bottom border past the safe
    // threshold with no page break, since this loop never ran the same
    // check the real-item loop above it does. Found by actually rendering
    // a quote with a long, multi-line description and seeing the terms box
    // border print straight through the footer text.
    const noPaginationOccurred = !paginationOccurred
    if (noPaginationOccurred) {
      while (bandIndex < 8 && rowTop - MIN_ROW_H >= PAGE_BOTTOM_SAFE + FOOTER_RESERVE) {
        if (bandIndex % 2 === 0) {
          page.drawRectangle({ x: MARGIN_L, y: rowTop - MIN_ROW_H, width: CONTENT_W, height: MIN_ROW_H, color: GREY_BAND })
        }
        rowTop -= MIN_ROW_H
        bandIndex++
      }
    }

    const tableTopForBorder = noPaginationOccurred ? 562.89 : PAGE_HEIGHT - 56
    const tableBottom = rowTop
    page.drawRectangle({ x: MARGIN_L, y: tableBottom, width: CONTENT_W, height: tableTopForBorder - tableBottom, borderColor: BORDER_INK, borderWidth: 1 })
    page.drawLine({ start: { x: colVatDivider, y: tableTopForBorder }, end: { x: colVatDivider, y: tableBottom }, thickness: 1, color: BORDER_INK })
    page.drawLine({ start: { x: colAmountDivider, y: tableTopForBorder }, end: { x: colAmountDivider, y: tableBottom }, thickness: 1, color: BORDER_INK })

    // ── Totals block (right side, below the table) ─────────────────
    let totalsY = tableBottom - 10.6
    if (quote.vatRate != null) {
      const totalsRows: [string, string][] = [
        ["Subtotal", fmtNumber(subtotal)],
        ["Taxable", fmtNumber(taxable)],
        ["VAT rate", `${quote.vatRate.toFixed(2)}%`],
        ["VAT due", fmtNumber(vatDue)],
      ]
      for (const [label, value] of totalsRows) {
        drawText(label, 454.7, totalsY, { size: 11, align: "right" })
        drawText(value, 545.1, totalsY, { size: 10, align: "right" })
        totalsY -= 15.0
      }
    }
    // TOTAL row — always shown, highlighted
    page.drawRectangle({ x: 472.2, y: totalsY - 4.4, width: 78.6, height: 15.0, color: TOTAL_TINT })
    drawText("TOTAL", 417.8, totalsY, { size: 11, bold: true })
    drawText("£", 477.8, totalsY, { size: 10, bold: true })
    drawText(fmtNumber(total), 544.9, totalsY, { size: 10, bold: true, align: "right" })

    // ── Terms and conditions (left column) + totals (right column) ──
    // These sit side by side, both anchored to the table bottom — not
    // sequential. Terms occupies x < 324; totals occupies x > 415; there's
    // no actual vertical collision between them to resolve.
    const termsBarTop = tableBottom - 14.3
    drawSectionBar("TERMS AND CONDITIONS", termsBarTop, 280.0)
    let termsY = termsBarTop - 14.3 - 9
    for (let i = 0; i < TERMS.length; i++) {
      const lines = wrapText(`${i + 1}. ${TERMS[i]}`, fontRegular, 10, 270)
      for (const line of lines) {
        drawText(line, 45.5, termsY, { size: 10 })
        termsY -= 13.6
      }
    }
    page.drawRectangle({
      x: MARGIN_L, y: termsY - 5, width: 280.4, height: (termsBarTop + 1) - (termsY - 5),
      borderColor: BORDER_INK, borderWidth: 1,
    })

    // ── Footer ──────────────────────────────────────────────────────
    const footerLine1 = "If you have any questions about this quote, please contact"
    const footerLine2 = `${COMPANY.footerContactName}, ${COMPANY.footerEmail}, Mob: ${COMPANY.footerMobile}`
    drawText(footerLine1, PAGE_WIDTH / 2 - fontRegular.widthOfTextAtSize(footerLine1, 10) / 2, 161.29, { size: 10 })
    drawText(footerLine2, PAGE_WIDTH / 2 - fontRegular.widthOfTextAtSize(footerLine2, 10) / 2, 147.69, { size: 10 })

    const pdfBytes = await doc.save()

    // ── Store the PDF under /public/quote-pdfs ────────────────────────
    const outDir  = path.join(process.cwd(), "public", "quote-pdfs")
    await fs.mkdir(outDir, { recursive: true })
    const safeNumber = quote.quoteNumber.replace(/[^a-zA-Z0-9\-_]/g, "_")
    const filename = `${safeNumber}.pdf`
    const outPath  = path.join(outDir, filename)
    if (!outPath.startsWith(outDir)) throw new Error("Invalid path")
    await fs.writeFile(outPath, pdfBytes)

    const pdfPath = `/quote-pdfs/${filename}`
    const updated = quoteDb.update(id, { pdfPath })

    return NextResponse.json({ pdfPath, quote: updated }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/quotes/[id]/pdf]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
