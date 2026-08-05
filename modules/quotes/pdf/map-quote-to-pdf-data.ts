import { clientService } from "@/modules/clients"
import { quoteService } from "../services/quote-service"
import { DEFAULT_QUOTE_TERMS } from "./company"
import type { QuotationPdfData } from "./types"

/** Load a persisted quote and map it into the shared quotation PDF model. */
export async function mapQuoteRecordToQuotationPdfData(
  id: string,
): Promise<QuotationPdfData> {
  const quote = await quoteService.findUnique(id)
  if (!quote) throw new Error("Quote not found")

  const [client, realLineItems] = await Promise.all([
    quote.clientId ? clientService.findUnique(quote.clientId) : Promise.resolve(null),
    quoteService.findLineItemsForQuote(quote.id),
  ])

  const items = realLineItems.length
    ? realLineItems.map(li => ({
        description: li.description,
        amount: li.amount,
        vatApplicable: li.vatApplicable === 1,
      }))
    : [{
        description: quote.description,
        amount: quote.quoteValue,
        vatApplicable: true,
      }]

  const subtotal = items.reduce((s, li) => s + li.amount, 0)
  const taxable = items.filter(li => li.vatApplicable).reduce((s, li) => s + li.amount, 0)
  const vatAmount = quote.vatRate != null ? taxable * (quote.vatRate / 100) : 0
  const grandTotal = quote.vatRate != null ? subtotal + vatAmount : subtotal

  return {
    quotationNumber: quote.quoteNumber,
    issueDate: quote.quoteDate,
    validUntil: quote.expiryDate,
    preparedBy: quote.createdBy,
    customerId: client?.accountCode ?? null,
    client: quote.clientCompany,
    contact: quote.contactName,
    site: quote.address,
    items,
    subtotal,
    taxable,
    vatRate: quote.vatRate,
    vatAmount,
    grandTotal,
    notes: quote.notes,
    terms: [...DEFAULT_QUOTE_TERMS],
  }
}
