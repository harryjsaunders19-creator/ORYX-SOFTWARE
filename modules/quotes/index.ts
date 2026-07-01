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

export { buildQuotePdfBuffer, generateQuotePdf } from "./pdf/generate"
export { quotePdfDownloadUrl, resolveQuotePdfUrl } from "./pdf/urls"

export { default as QuotesPage } from "./components/quotes-page"
