/**
 * lib/services/quote-service.ts
 *
 * When SUPABASE_QUOTES=true:
 *   - Reads come from Supabase
 *   - Writes run SQLite first (quote numbers via sequenceDb), then mirror to Supabase
 */
import type {
  CreateQuoteData,
  CreateQuoteLineItemData,
  QuoteLineItemRow,
  QuoteListOptions,
  QuoteRow,
  UpdateQuoteData,
} from "@/lib/db/quote-types"
import { quoteDb, quoteLineItemDb } from "@/lib/db/stores"
import { useSupabaseQuotes } from "@/lib/supabase/feature-flags"
import { supabaseQuoteRepo } from "@/lib/supabase/repositories/quotes"

async function mirrorQuote(quote: QuoteRow | null) {
  if (quote && useSupabaseQuotes()) await supabaseQuoteRepo.upsert(quote)
}

async function mirrorLineItems(quoteId: string) {
  if (!useSupabaseQuotes()) return
  const items = quoteLineItemDb.findForQuote(quoteId)
  await supabaseQuoteRepo.replaceLineItems(quoteId, items)
}

export const quoteService = {
  async findMany(opts: QuoteListOptions = {}): Promise<QuoteRow[]> {
    if (!useSupabaseQuotes()) return quoteDb.findMany(opts)
    return supabaseQuoteRepo.findMany(opts)
  },

  async count(opts: QuoteListOptions = {}): Promise<number> {
    if (!useSupabaseQuotes()) return quoteDb.count(opts)
    return supabaseQuoteRepo.count(opts)
  },

  async findUnique(id: string): Promise<QuoteRow | null> {
    if (!useSupabaseQuotes()) return quoteDb.findUnique(id)
    return supabaseQuoteRepo.findUnique(id)
  },

  async findByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    if (!useSupabaseQuotes()) return quoteDb.findByNumber(quoteNumber)
    return supabaseQuoteRepo.findByNumber(quoteNumber)
  },

  async create(data: CreateQuoteData): Promise<QuoteRow> {
    const quote = quoteDb.create(data)
    await mirrorQuote(quote)
    return quote
  },

  async update(id: string, data: UpdateQuoteData): Promise<QuoteRow | null> {
    const quote = quoteDb.update(id, data)
    await mirrorQuote(quote)
    return quote
  },

  async delete(id: string): Promise<boolean> {
    const ok = quoteDb.delete(id)
    if (ok && useSupabaseQuotes()) await supabaseQuoteRepo.delete(id)
    return ok
  },

  async findLineItemsForQuote(quoteId: string): Promise<QuoteLineItemRow[]> {
    if (!useSupabaseQuotes()) return quoteLineItemDb.findForQuote(quoteId)
    return supabaseQuoteRepo.findLineItemsForQuote(quoteId)
  },

  async replaceLineItems(quoteId: string, items: CreateQuoteLineItemData[]): Promise<void> {
    quoteLineItemDb.replaceForQuote(quoteId, items)
    await mirrorLineItems(quoteId)
  },

  /** After a direct SQLite write inside a transaction (e.g. convert-to-job). */
  async syncFromSqlite(id: string): Promise<QuoteRow | null> {
    const quote = quoteDb.findUnique(id)
    await mirrorQuote(quote)
    if (quote) await mirrorLineItems(id)
    return quote
  },

  /** Dashboard stats — reads Supabase when SUPABASE_QUOTES=true. */
  async stats() {
    if (!useSupabaseQuotes()) return quoteDb.stats()
    return supabaseQuoteRepo.stats()
  },
}
