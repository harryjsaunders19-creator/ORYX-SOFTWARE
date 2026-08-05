/**
 * Quotes module — public API.
 * Import from `@/modules/quotes` only; do not reach into subfolders.
 */
export { quoteService } from "./services/quote-service"

export type {
  QuoteRow,
  CreateQuoteData,
  UpdateQuoteData,
  QuoteLineItemRow,
  CreateQuoteLineItemData,
  QuoteListOptions,
} from "./types"

export { supabaseQuoteRepo } from "./supabase/repository"

export {
  quoteWorksDisplayLabel,
  inferQuoteWorksFromDescription,
  shouldAutoExpireQuote,
  parseQuoteWorksBody,
} from "./quote-works"

export { startQuoteExpiryScheduler } from "./quote-expiry-scheduler"

export { buildQuotePdfBuffer, buildQuotePdfFromPayload, generateQuotePdf } from "./pdf/generate"
export { quotePdfDownloadUrl, resolveQuotePdfUrl } from "./pdf/urls"
export { DEFAULT_QUOTE_TERMS, QUOTE_COMPANY } from "./pdf/company"
export type { QuotationPdfData, QuotationPdfLineItem } from "./pdf/types"

export { default as QuotesPage } from "./components/quotes-page"
