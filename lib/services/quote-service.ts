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
import { todayIsoDate, addDaysToIsoDate } from "@/lib/utils"
import { ensureClientInSqlite } from "@/lib/services/client-service"
import { ensureJobInSqliteForBilling } from "@/lib/services/job-service"
import { archiveLogService } from "@/lib/services/archive-log-service"
import { nowIso } from "@/lib/db/helpers"

async function mirrorQuote(quote: QuoteRow | null) {
  if (quote && useSupabaseQuotes()) await supabaseQuoteRepo.upsert(quote)
}

/**
 * Ensures a quote exists in the local SQLite DB by fetching it from Supabase
 * if missing. On a fresh Vercel container the SQLite Quote table is empty, so
 * updates would otherwise return null → 404.
 */
async function ensureQuoteInSqlite(id: string): Promise<boolean> {
  if (!useSupabaseQuotes()) return quoteDb.findUnique(id) !== null
  if (quoteDb.findUnique(id)) return true
  const quote = await supabaseQuoteRepo.findUnique(id)
  if (!quote) return false
  quoteDb.rawInsertOrIgnore(quote)
  return quoteDb.findUnique(id) !== null
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
    // Ensure the client exists in SQLite before writing — Quote.clientId has a
    // FK constraint on Client.id, and the SQLite Client table is empty on a
    // fresh Vercel container.
    await ensureClientInSqlite(data.clientId)
    const quote = quoteDb.create(data)
    await mirrorQuote(quote)
    return quote
  },

  async update(id: string, data: UpdateQuoteData): Promise<QuoteRow | null> {
    // Ensure the quote exists in SQLite (it only lives in Supabase on a fresh container).
    await ensureQuoteInSqlite(id)
    // If linking this quote to a job, ensure that job is in SQLite (Quote.jobId FK).
    if (data.jobId) await ensureJobInSqliteForBilling(data.jobId)
    const quote = quoteDb.update(id, data)
    await mirrorQuote(quote)
    return quote
  },

  /** Soft-delete a quote: marks it as archived. Logs the action. */
  async archive(id: string, archiverId: string, archiverName: string): Promise<QuoteRow | null> {
    if (!(await ensureQuoteInSqlite(id))) return null
    const quote = quoteDb.findUnique(id)
    if (!quote) return null
    const now = nowIso()
    quoteDb.archive(id, archiverId, now)
    const updated = quoteDb.findUnique(id)
    if (useSupabaseQuotes() && updated) await supabaseQuoteRepo.archive(id, archiverId, now)
    archiveLogService.log({
      entityType: "quote", entityId: id,
      entityLabel: quote.quoteNumber,
      action: "archive",
      performedBy: archiverId, performedByName: archiverName,
    })
    return updated
  },

  /** Restore a previously archived quote. */
  async restore(id: string, restorerId: string, restorerName: string): Promise<QuoteRow | null> {
    if (!(await ensureQuoteInSqlite(id))) return null
    const quote = quoteDb.findUnique(id)
    if (!quote) return null
    const now = nowIso()
    quoteDb.restore(id, now)
    const updated = quoteDb.findUnique(id)
    if (useSupabaseQuotes() && updated) await supabaseQuoteRepo.restore(id, now)
    archiveLogService.log({
      entityType: "quote", entityId: id,
      entityLabel: quote.quoteNumber,
      action: "restore",
      performedBy: restorerId, performedByName: restorerName,
    })
    return updated
  },

  async findArchived(): Promise<QuoteRow[]> {
    if (!useSupabaseQuotes()) return quoteDb.findArchived()
    return supabaseQuoteRepo.findArchived()
  },

  async delete(id: string): Promise<boolean> {
    const ok = quoteDb.delete(id)
    if (ok && useSupabaseQuotes()) await supabaseQuoteRepo.delete(id)
    return ok
  },

  /** Archive all expired quotes that were never converted to a job. */
  async clearExpired(archiverId = "System", archiverName = "System"): Promise<{ archived: number }> {
    const removed = quoteDb.deleteExpired(archiverId)
    if (useSupabaseQuotes()) {
      for (const q of removed) {
        const now = q.archivedAt ?? nowIso()
        await supabaseQuoteRepo.archive(q.id, archiverId, now)
      }
    }
    for (const q of removed) {
      archiveLogService.log({
        entityType: "quote", entityId: q.id,
        entityLabel: q.quoteNumber,
        action: "archive",
        performedBy: archiverId, performedByName: archiverName,
        reason: "Bulk archive of expired quotes",
      })
    }
    return { archived: removed.length }
  },

  countExpiredDeletable(): number {
    return quoteDb.countExpiredDeletable()
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

  /** Auto-expire open quotes past their expiry date. Returns rows updated. */
  async expirePastDue() {
    const asOf = todayIsoDate()
    const expired = quoteDb.expirePastDue(asOf)
    for (const q of expired) await mirrorQuote(q)
    if (useSupabaseQuotes()) {
      await supabaseQuoteRepo.expirePastDue(asOf)
    }
    return expired
  },

  async countExpiringSoon(): Promise<number> {
    const asOf = todayIsoDate()
    const through = addDaysToIsoDate(new Date(asOf + "T00:00:00"), 7)
    if (useSupabaseQuotes()) {
      return supabaseQuoteRepo.countExpiringSoon(asOf, through)
    }
    return quoteDb.countExpiringSoon(asOf)
  },
}
