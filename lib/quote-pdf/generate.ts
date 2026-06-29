/**
 * Quote PDF generation — extracted from the API route so it can run
 * in the background via next/server `after()`.
 */
import { quoteService } from "@/lib/services/quote-service"
import { clientService } from "@/lib/services/client-service"
import { quotePdfDownloadUrl } from "@/lib/quote-pdf/urls"
import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import { format } from "date-fns"
import fs from "fs/promises"
import path from "path"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"

const PAGE_WIDTH  = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_L    = 43.7
const MARGIN_R    = 551.2
const CONTENT_W   = MARGIN_R - MARGIN_L

const INK    = rgb(0, 0, 0)
const WHITE  = rgb(1, 1, 1)
const GREY_BAND   = rgb(0.949, 0.949, 0.949)
const TOTAL_TINT  = rgb(0.824, 0.851, 0.925)
const BORDER_GREY = rgb(0.502, 0.502, 0.502)
const BORDER_INK  = rgb(0, 0, 0)

const COMPANY = {
  name: "ORYX Scaffold Design Ltd",
  addressLines: ["Little Woodlands, 61 Bath Road, Willsbridge.", "Bristol, BS30 6ES."],
  phone: "Phone: 0117 3290050",
  footerContactName: "Harry Saunders",
  footerEmail: "harry@oryxdesignltd.co.uk",
  footerMobile: "07712596936",
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
  const fontBold     = await doc.embedFont(boldBytes)

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

  drawText(COMPANY.name, 176.4, 756.09, { size: 20, bold: false })
  drawText("QUOTE", 546.4, 768.19, { size: 26, bold: true, align: "right" })

  let leftY = 728.39
  for (const line of COMPANY.addressLines) {
    drawText(line, 45.5, leftY, { size: 10 })
    leftY -= 13.6
  }
  drawText(COMPANY.phone, 45.5, leftY, { size: 10 }); leftY -= 13.6
  drawText(`Prepared by: ${preparedBy}`, 45.5, leftY, { size: 10 })

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

  drawSectionBar("CUSTOMER", 672.59, 186.5)
  let custY = 646.39
  drawText(truncateToWidth(quote.clientCompany, fontRegular, 10, 250), 45.5, custY, { size: 10 }); custY -= 13.6
  if (quote.contactName) drawText(truncateToWidth(`Contact - ${quote.contactName}`, fontRegular, 10, 250), 45.5, custY, { size: 10 })

  drawSectionBar("SITE", 617.69, 186.5)
  let siteY = 591.59
  drawText(truncateToWidth(quote.address, fontRegular, 10, 250), 45.5, siteY, { size: 10 }); siteY -= 13.6
  const sitePreview = quote.description.split("\n")[0]
  drawText(truncateToWidth(sitePreview, fontRegular, 10, 250), 45.5, siteY, { size: 10 })

  const colDescX = MARGIN_L, colVatDivider = 415.1, colAmountDivider = 471.7
  const descColWidth = colVatDivider - colDescX - 4
  const MIN_ROW_H = 27.1, LINE_H = 13.6
  const FOOTER_RESERVE = 270
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
  let bandIndex = 0

  for (const item of lineItems) {
    const descLines = wrapText(item.description, fontRegular, 10, descColWidth)
    const rowH = Math.max(MIN_ROW_H, descLines.length * LINE_H + 3)

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
    if (item.vatApplicable) drawText("X", 444.3, rowTop - 10, { size: 10, align: "center", maxWidth: 0 })
    drawText(fmtNumber(item.amount), 545.1, rowTop - 10, { size: 10, align: "right" })

    rowTop -= rowH
    bandIndex++
  }

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
  page.drawRectangle({ x: 472.2, y: totalsY - 4.4, width: 78.6, height: 15.0, color: TOTAL_TINT })
  drawText("TOTAL", 417.8, totalsY, { size: 11, bold: true })
  drawText("£", 477.8, totalsY, { size: 10, bold: true })
  drawText(fmtNumber(total), 544.9, totalsY, { size: 10, bold: true, align: "right" })

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

  const footerLine1 = "If you have any questions about this quote, please contact"
  const footerLine2 = `${COMPANY.footerContactName}, ${COMPANY.footerEmail}, Mob: ${COMPANY.footerMobile}`
  drawText(footerLine1, PAGE_WIDTH / 2 - fontRegular.widthOfTextAtSize(footerLine1, 10) / 2, 161.29, { size: 10 })
  drawText(footerLine2, PAGE_WIDTH / 2 - fontRegular.widthOfTextAtSize(footerLine2, 10) / 2, 147.69, { size: 10 })

  const pdfBytes = await doc.save()
  const safeNumber = quote.quoteNumber.replace(/[^a-zA-Z0-9\-_]/g, "_")
  return { pdfBytes, filename: `${safeNumber}.pdf` }
}

export async function generateQuotePdf(id: string): Promise<{ pdfPath: string }> {
  const { pdfBytes, filename } = await buildQuotePdfBuffer(id)

  // Local dev without Supabase: keep static files for faster repeat opens.
  if (!isSupabaseAdminConfigured()) {
    const outDir = path.join(process.cwd(), "public", "quote-pdfs")
    await fs.mkdir(outDir, { recursive: true })
    const outPath = path.join(outDir, filename)
    if (!outPath.startsWith(outDir)) throw new Error("Invalid path")
    await fs.writeFile(outPath, pdfBytes)
    const pdfPath = `/quote-pdfs/${filename}`
    await quoteService.updatePdfPath(id, pdfPath)
    return { pdfPath }
  }

  const pdfPath = quotePdfDownloadUrl(id)
  await quoteService.updatePdfPath(id, pdfPath)
  return { pdfPath }
}
