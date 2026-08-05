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
import { DEFAULT_QUOTE_TERMS } from "./company"
import { QuotePdfContext } from "./context"
import { fmtPdfDate } from "./format"
import { MIN_CONTENT_Y } from "./layout"
import type { QuotePdfLineItem, QuotePdfPayload } from "./types"
import { drawQuoteHeader } from "./components/header"
import { drawQuoteTitleBlock } from "./components/title-block"
import { drawClientInformation } from "./components/client-info"
import { drawPricingTable } from "./components/pricing-table"
import { drawTotalsSummary } from "./components/totals"
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

  const commercialSources = realLineItems.length
    ? realLineItems.map(li => ({
        description: li.description,
        amount: li.amount,
        vatApplicable: li.vatApplicable === 1,
      }))
    : [{ description: quote.description, amount: quote.quoteValue, vatApplicable: true }]

  const subtotal = commercialSources.reduce((sum, li) => sum + li.amount, 0)
  const taxable = commercialSources
    .filter(li => li.vatApplicable)
    .reduce((sum, li) => sum + li.amount, 0)
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

  // Table rows: when explicit line items exist, ORYX shows the scope + notes
  // *inside* the table as narrative rows without amounts.
  const hasRealLineItems = realLineItems.length > 0
  const tableRows: QuotePdfLineItem[] = []

  if (hasRealLineItems) {
    if (quote.description?.trim()) {
      tableRows.push({
        description: quote.description.trim(),
        purchaseOrder: null,
        vatAmount: null,
        amount: null,
      })
    }
    if (notes) {
      tableRows.push({
        description: notes,
        purchaseOrder: null,
        vatAmount: null,
        amount: null,
      })
    }

    tableRows.push(
      ...commercialSources.map(item => ({
        description: item.description,
        purchaseOrder: null,
        vatAmount: showVat && item.vatApplicable ? item.amount * (vatRate! / 100) : null,
        amount: item.amount,
      })),
    )
  } else {
    // No explicit breakdown: the quote description is the single priced row.
    tableRows.push({
      description: quote.description.trim(),
      purchaseOrder: null,
      vatAmount: showVat ? quote.quoteValue * (vatRate! / 100) : null,
      amount: quote.quoteValue,
    })
    if (notes) {
      tableRows.push({
        description: notes,
        purchaseOrder: null,
        vatAmount: null,
        amount: null,
      })
    }
  }

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
    scope: quote.description?.trim() || null,
    quotationNotes: notes,
    lineItems: tableRows,
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
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-Regular.ttf")),
    fs.readFile(path.join(process.cwd(), "public", "fonts", "Inter-Bold.ttf")),
    fs.readFile(path.join(process.cwd(), BRAND_LOGO_DOCUMENT_PATH)),
  ])

  const fontRegular = await doc.embedFont(regularBytes)
  const fontBold = await doc.embedFont(boldBytes)
  const logoImage = await doc.embedJpg(logoBytes)

  const ctx = new QuotePdfContext(doc, fontRegular, fontBold, logoImage)

  ctx.cursorY = drawQuoteHeader(ctx)
  ctx.cursorY = drawQuoteTitleBlock(ctx, payload.meta)
  ctx.cursorY = drawClientInformation(ctx, payload.client)

  const continuation = `Quotation Items (continued) · ${payload.meta.quoteNumber}`
  const { endY: tableEndY } = drawPricingTable(
    ctx,
    payload.lineItems,
    payload.totals.showVat,
    continuation,
  )
  ctx.cursorY = tableEndY

  const termsHeight = termsSectionMinHeight(ctx, payload.terms)
  // Totals sit directly beneath the pricing table.
  const totalsEndY = drawTotalsSummary(ctx, payload.totals, ctx.cursorY)
  // drawTotalsSummary() already accounts for a small bottom gap.
  ctx.cursorY = totalsEndY

  // Terms follow totals: if the Terms block fits, keep it on this page.
  // If it doesn't fit, move the entire block to the next page (no splitting).
  const availableOnPage = ctx.cursorY - MIN_CONTENT_Y
  const needsMoveToNextPage = termsHeight > availableOnPage
  if (needsMoveToNextPage) ctx.addPage()

  const availableAfterMove = ctx.cursorY - MIN_CONTENT_Y
  const allowSplit = termsHeight > availableAfterMove
  ctx.cursorY = drawTermsSection(ctx, payload.terms, ctx.cursorY, { allowSplit })

  drawFooters(ctx)

  return doc.save()
}
