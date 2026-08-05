/**
 * Quote PDF generation — premium corporate layout for engineering consultancy quotations.
 *
 * Layout is composed from discrete drawing components (header, title block, client panel,
 * pricing table, totals, terms, footer). Each section returns the next vertical cursor
 * position; pagination is handled centrally via QuotePdfContext.
 */
import { quoteService } from "../services/quote-service"
import { clientService } from "@/modules/clients"
import { quotePdfDownloadUrl } from "./urls"
import { setCachedQuotePdf } from "./cache"
import { PDFDocument } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"
import fs from "fs/promises"
import path from "path"
import { BRAND_LOGO_DOCUMENT_PATH } from "@/shared/branding/branding"
import { quoteWorksDisplayLabel } from "../quote-works"
import { DEFAULT_QUOTE_TERMS, QUOTE_COMPANY } from "./company"
import { QuotePdfContext } from "./context"
import { fmtPdfDate } from "./format"
import { MIN_CONTENT_Y, SP } from "./layout"
import type { QuotePdfLineItem, QuotePdfPayload } from "./types"
import { drawQuoteHeader } from "./components/header"
import { drawQuoteTitleBlock } from "./components/title-block"
import { drawClientInformation } from "./components/client-info"
import { drawProjectDescription } from "./components/project-description"
import { drawPricingTable } from "./components/pricing-table"
import { drawTotalsSummary, measureTotalsBoxHeight } from "./components/totals"
import { drawTermsSection, termsSectionMinHeight } from "./components/terms"
import { drawFooters } from "./components/footer"

export async function buildQuotePdfBuffer(
  id: string,
): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  const quote = await quoteService.findUnique(id)
  if (!quote) throw new Error("Quote not found")

  const [client, realLineItems] = await Promise.all([
    quote.clientId ? clientService.findUnique(quote.clientId) : Promise.resolve(null),
    quoteService.findLineItemsForQuote(quote.id),
  ])

  const payload = buildQuotePayload(quote, client, realLineItems)
  const pdfBytes = await renderQuotePdf(payload)
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

function buildQuotePayload(
  quote: NonNullable<Awaited<ReturnType<typeof quoteService.findUnique>>>,
  client: Awaited<ReturnType<typeof clientService.findUnique>>,
  realLineItems: Awaited<ReturnType<typeof quoteService.findLineItemsForQuote>>,
): QuotePdfPayload {
  const vatRate = quote.vatRate
  const showVat = vatRate != null

  const rawItems = realLineItems.length
    ? realLineItems.map(li => ({
        description: li.description,
        amount: li.amount,
        vatApplicable: li.vatApplicable === 1,
      }))
    : [{ description: quote.description, amount: quote.quoteValue, vatApplicable: true }]

  const lineItems: QuotePdfLineItem[] = rawItems.map(item => {
    const quantity = 1
    const unitRate = item.amount
    const lineTotal = item.amount
    const vatAmount =
      showVat && item.vatApplicable ? lineTotal * (vatRate! / 100) : null
    return {
      description: item.description,
      quantity,
      unitRate,
      vatApplicable: item.vatApplicable,
      lineTotal,
      vatAmount,
    }
  })

  const subtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0)
  const taxable = lineItems
    .filter(li => li.vatApplicable)
    .reduce((sum, li) => sum + li.lineTotal, 0)
  const vatDue = showVat ? taxable * (vatRate! / 100) : null
  const grandTotal = showVat ? subtotal + (vatDue ?? 0) : subtotal

  const projectLabel = quoteWorksDisplayLabel(
    quote.typeOfWorks,
    quote.customTypeDescription,
    quote.description,
  )
  const siteAddress = quote.address?.trim() || null
  const billingAddress = client?.billingAddress?.trim() || null
  const showBillingAddress =
    billingAddress &&
    siteAddress &&
    billingAddress.toLowerCase() !== siteAddress.toLowerCase()

  const notes = quote.notes?.trim() || null

  return {
    meta: {
      quoteNumber: quote.quoteNumber,
      issueDate: fmtPdfDate(quote.quoteDate),
      validUntil: fmtPdfDate(quote.expiryDate),
      preparedBy: quote.createdBy,
    },
    client: {
      client: quote.clientCompany?.trim() || undefined,
      contact: quote.contactName?.trim() || undefined,
      project: projectLabel || undefined,
      site: siteAddress || undefined,
      address: showBillingAddress ? billingAddress : undefined,
      reference: client?.accountCode?.trim() || undefined,
    },
    projectDescription: notes,
    lineItems,
    totals: {
      subtotal,
      vat: vatDue,
      grandTotal,
      showVat,
    },
    terms: [...DEFAULT_QUOTE_TERMS],
  }
}

async function renderQuotePdf(payload: QuotePdfPayload): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const [regularBytes, boldBytes, logoBytes] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf")),
    fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH)),
  ])

  const fontRegular = await doc.embedFont(regularBytes)
  const fontBold = await doc.embedFont(boldBytes)
  const logoImage = await doc.embedJpg(logoBytes)

  const ctx = new QuotePdfContext(doc, fontRegular, fontBold, logoImage)

  ctx.cursorY = drawQuoteHeader(ctx)
  ctx.cursorY = drawQuoteTitleBlock(ctx, payload.meta)
  ctx.cursorY = drawClientInformation(ctx, payload.client)
  ctx.cursorY = drawProjectDescription(ctx, payload.projectDescription)

  const continuation = `${QUOTE_COMPANY.name}  ·  ${payload.meta.quoteNumber}`
  const { endY: tableEndY } = drawPricingTable(
    ctx,
    payload.lineItems,
    payload.totals.showVat,
    continuation,
  )
  ctx.cursorY = tableEndY

  const termsHeight = termsSectionMinHeight(ctx, payload.terms)
  const totalsHeight = measureTotalsBoxHeight(payload.totals)
  const blockHeight = Math.max(termsHeight, totalsHeight) + SP.xl
  if (ctx.cursorY - blockHeight < MIN_CONTENT_Y) {
    ctx.addPage()
  }

  const summaryAnchorY = ctx.cursorY
  const totalsEndY = drawTotalsSummary(ctx, payload.totals, summaryAnchorY)
  const termsEndY = drawTermsSection(ctx, payload.terms, summaryAnchorY)
  ctx.cursorY = Math.min(totalsEndY, termsEndY)

  drawFooters(ctx)

  return doc.save()
}
