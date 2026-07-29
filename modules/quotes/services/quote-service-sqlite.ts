/**
 * Quotes — SQLite path for local/CI when Supabase admin is not configured.
 *
 * Dual-write to Supabase was removed: when admin credentials are present the
 * entry router loads quote-service-supabase.ts instead (isSupabaseOnly()).
 */
import type {
  CreateQuoteData,
  CreateQuoteLineItemData,
  QuoteLineItemRow,
  QuoteListOptions,
  QuoteRow,
  UpdateQuoteData,
} from "../types/quote-types"
import { quoteDb, quoteLineItemDb } from "@/lib/db/stores"
import { todayIsoDate } from "@/shared/utils/utils"
import { archiveLogService } from "@/modules/archive"
import { nowIso } from "@/lib/db/helpers"
import { invalidateQuotePdf } from "../pdf/cache"

export const quoteService = {
  async findMany(opts: QuoteListOptions = {}): Promise<QuoteRow[]> {
    return quoteDb.findMany(opts)
  },

  async count(opts: QuoteListOptions = {}): Promise<number> {
    return quoteDb.count(opts)
  },

  async findUnique(id: string): Promise<QuoteRow | null> {
    return quoteDb.findUnique(id)
  },

  async findByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    return quoteDb.findByNumber(quoteNumber)
  },

  async create(data: CreateQuoteData): Promise<QuoteRow> {
    return quoteDb.create(data)
  },

  async update(id: string, data: UpdateQuoteData): Promise<QuoteRow | null> {
    const quote = quoteDb.update(id, data)
    if (quote) invalidateQuotePdf(id)
    return quote
  },

  /**
   * Atomically link a quote to a job (convert flow).
   */
  async linkToJob(quoteId: string, jobId: string): Promise<QuoteRow | null> {
    if (!quoteDb.findUnique(quoteId)) return null
    const quote = quoteDb.update(quoteId, { jobId })
    if (quote) invalidateQuotePdf(quoteId)
    return quote
  },

  async updatePdfPath(id: string, pdfPath: string | null): Promise<void> {
    if (pdfPath === null) invalidateQuotePdf(id)
    quoteDb.update(id, { pdfPath })
  },

  async archive(id: string, archiverId: string, archiverName: string): Promise<QuoteRow | null> {
    const now = nowIso()
    const quote = quoteDb.findUnique(id)
    if (!quote) return null
    quoteDb.archive(id, archiverId, now)
    const updated = quoteDb.findUnique(id)
    if (updated) {
      archiveLogService.log({
        entityType: "quote", entityId: id,
        entityLabel: quote.quoteNumber,
        action: "archive",
        performedBy: archiverId, performedByName: archiverName,
      })
    }
    return updated
  },

  async restore(id: string, restorerId: string, restorerName: string): Promise<QuoteRow | null> {
    const now = nowIso()
    const quote = quoteDb.findUnique(id)
    if (!quote) return null
    quoteDb.restore(id, now)
    const updated = quoteDb.findUnique(id)
    if (updated) {
      archiveLogService.log({
        entityType: "quote", entityId: id,
        entityLabel: quote.quoteNumber,
        action: "restore",
        performedBy: restorerId, performedByName: restorerName,
      })
    }
    return updated
  },

  async findArchived(): Promise<QuoteRow[]> {
    return quoteDb.findArchived()
  },

  async delete(id: string): Promise<boolean> {
    return quoteDb.delete(id)
  },

  async clearExpired(archiverId = "System", archiverName = "System"): Promise<{ archived: number }> {
    await this.expirePastDue()
    const removed = quoteDb.deleteExpired(archiverId)
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
    return quoteLineItemDb.findForQuote(quoteId)
  },

  async replaceLineItems(quoteId: string, items: CreateQuoteLineItemData[]): Promise<void> {
    quoteLineItemDb.replaceForQuote(quoteId, items)
  },

  /** After a direct SQLite write inside a transaction (e.g. convert-to-job). */
  async syncFromSqlite(id: string): Promise<QuoteRow | null> {
    return quoteDb.findUnique(id)
  },

  async stats() {
    return quoteDb.stats()
  },

  async expirePastDue() {
    return quoteDb.expirePastDue(todayIsoDate())
  },

  async countExpiringSoon(): Promise<number> {
    const asOf = todayIsoDate()
    return quoteDb.countExpiringSoon(asOf)
  },
}
