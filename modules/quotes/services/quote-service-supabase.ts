/**
 * Supabase-only quote operations (Vercel / isSupabaseOnly).
 * Never imports SQLite stores, client-service, or job-service.
 */
import { createId as nanoid } from "@paralleldrive/cuid2"
import type {
  CreateQuoteData,
  CreateQuoteLineItemData,
  QuoteLineItemRow,
  QuoteListOptions,
  QuoteRow,
  UpdateQuoteData,
} from "../types/quote-types"
import { nowIso } from "@/lib/db/helpers"
import { probeArchivedColumns } from "@/shared/supabase/archived-filter"
import { todayIsoDate, addDaysToIsoDate } from "@/shared/utils/utils"
import { nextRefNumberAsync } from "@/shared/supabase/sequence-service"
import { supabaseArchiveLogRepo } from "@/modules/archive/supabase/repository"
import { supabaseQuoteRepo } from "../supabase/repository"
import { invalidateQuotePdf } from "../pdf/cache"

async function logArchive(opts: {
  entityId: string
  entityLabel: string
  action: "archive" | "restore"
  performedBy: string
  performedByName: string
  reason?: string
}): Promise<void> {
  try {
    await supabaseArchiveLogRepo.insert({
      id: nanoid(),
      entityType: "quote",
      entityId: opts.entityId,
      entityLabel: opts.entityLabel,
      action: opts.action,
      performedBy: opts.performedBy,
      performedByName: opts.performedByName,
      performedAt: nowIso(),
      reason: opts.reason ?? null,
    })
  } catch (err) {
    console.warn("[quoteService] archive log failed:", err)
  }
}

function toLineItemRows(quoteId: string, items: CreateQuoteLineItemData[]): QuoteLineItemRow[] {
  const now = nowIso()
  return items.map((item, index) => ({
    id: nanoid(),
    quoteId,
    description: item.description,
    amount: item.amount,
    vatApplicable: item.vatApplicable === false ? 0 : 1,
    sortOrder: item.sortOrder ?? index,
    createdAt: now,
  }))
}

export const quoteService = {
  async findMany(opts: QuoteListOptions = {}): Promise<QuoteRow[]> {
    return supabaseQuoteRepo.findMany(opts)
  },

  async count(opts: QuoteListOptions = {}): Promise<number> {
    return supabaseQuoteRepo.count(opts)
  },

  async findUnique(id: string): Promise<QuoteRow | null> {
    return supabaseQuoteRepo.findUnique(id)
  },

  async findByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    return supabaseQuoteRepo.findByNumber(quoteNumber)
  },

  async create(data: CreateQuoteData): Promise<QuoteRow> {
    const now = nowIso()
    const id = data.id ?? nanoid()
    const quoteNumber = data.quoteNumber ?? await nextRefNumberAsync("Q")
    const quote: QuoteRow = {
      id,
      quoteNumber,
      clientId: data.clientId ?? null,
      clientCompany: data.clientCompany.trim(),
      contactName: data.contactName?.trim() || null,
      address: data.address.trim(),
      description: data.description.trim(),
      typeOfWorks: data.typeOfWorks?.trim() || null,
      customTypeDescription: data.customTypeDescription?.trim() || null,
      quoteValue: data.quoteValue,
      quoteDate: data.quoteDate,
      expiryDate: data.expiryDate ?? null,
      status: data.status ?? "DRAFT",
      notes: data.notes?.trim() || null,
      jobId: null,
      createdBy: data.createdBy ?? "System",
      pdfPath: null,
      preparedBy: null,
      vatRate: data.vatRate ?? null,
      archivedAt: null,
      archivedBy: null,
      createdAt: now,
      updatedAt: now,
    }
    await supabaseQuoteRepo.upsert(quote)
    return quote
  },

  async update(id: string, data: UpdateQuoteData): Promise<QuoteRow | null> {
    const existing = await supabaseQuoteRepo.findUnique(id)
    if (!existing) return null
    const now = nowIso()
    const quote: QuoteRow = {
      ...existing,
      clientId: data.clientId !== undefined ? data.clientId : existing.clientId,
      clientCompany: data.clientCompany ?? existing.clientCompany,
      contactName: data.contactName !== undefined ? data.contactName : existing.contactName,
      address: data.address ?? existing.address,
      description: data.description ?? existing.description,
      typeOfWorks: data.typeOfWorks !== undefined ? data.typeOfWorks : existing.typeOfWorks,
      customTypeDescription: data.customTypeDescription !== undefined
        ? data.customTypeDescription
        : existing.customTypeDescription,
      quoteValue: data.quoteValue ?? existing.quoteValue,
      quoteDate: data.quoteDate ?? existing.quoteDate,
      expiryDate: data.expiryDate !== undefined ? data.expiryDate : existing.expiryDate,
      status: data.status ?? existing.status,
      notes: data.notes !== undefined ? data.notes : existing.notes,
      jobId: data.jobId !== undefined ? data.jobId : existing.jobId,
      pdfPath: data.pdfPath !== undefined ? data.pdfPath : existing.pdfPath,
      preparedBy: data.preparedBy !== undefined ? data.preparedBy : existing.preparedBy,
      vatRate: data.vatRate !== undefined ? data.vatRate : existing.vatRate,
      updatedAt: now,
    }
    await supabaseQuoteRepo.upsert(quote)
    invalidateQuotePdf(id)
    return quote
  },

  async findByJobIds(jobIds: string[]): Promise<QuoteRow[]> {
    return supabaseQuoteRepo.findByJobIds(jobIds)
  },

  async setJobId(quoteId: string, jobId: string | null): Promise<QuoteRow | null> {
    const updated = await supabaseQuoteRepo.setJobId(quoteId, jobId)
    if (updated) invalidateQuotePdf(quoteId)
    return updated
  },

  async linkToJob(quoteId: string, jobId: string): Promise<QuoteRow | null> {
    const linked = await supabaseQuoteRepo.linkJobId(quoteId, jobId)
    if (linked) invalidateQuotePdf(quoteId)
    return linked
  },

  async updatePdfPath(id: string, pdfPath: string | null): Promise<void> {
    if (pdfPath === null) invalidateQuotePdf(id)
    await supabaseQuoteRepo.updatePdfPath(id, pdfPath)
  },

  async archive(id: string, archiverId: string, archiverName: string): Promise<QuoteRow | null> {
    const now = nowIso()
    await probeArchivedColumns()
    const remote = await supabaseQuoteRepo.findUnique(id)
    if (!remote) return null
    const ok = await supabaseQuoteRepo.archive(id, archiverId, now)
    if (!ok) return null
    const updated = await supabaseQuoteRepo.findUnique(id)
    if (updated) {
      await logArchive({
        entityId: id,
        entityLabel: remote.quoteNumber,
        action: "archive",
        performedBy: archiverId,
        performedByName: archiverName,
      })
    }
    return updated
  },

  async restore(id: string, restorerId: string, restorerName: string): Promise<QuoteRow | null> {
    const now = nowIso()
    const remote = await supabaseQuoteRepo.findUnique(id)
    if (!remote) return null
    const ok = await supabaseQuoteRepo.restore(id, now)
    if (!ok) return null
    const updated = await supabaseQuoteRepo.findUnique(id)
    if (updated) {
      await logArchive({
        entityId: id,
        entityLabel: remote.quoteNumber,
        action: "restore",
        performedBy: restorerId,
        performedByName: restorerName,
      })
    }
    return updated
  },

  async findArchived(): Promise<QuoteRow[]> {
    return supabaseQuoteRepo.findArchived()
  },

  async delete(id: string): Promise<boolean> {
    return supabaseQuoteRepo.delete(id)
  },

  async clearExpired(archiverId = "System", archiverName = "System"): Promise<{ archived: number }> {
    await this.expirePastDue()
    const expired = await supabaseQuoteRepo.findExpiredArchivable()
    let archived = 0
    for (const q of expired) {
      if (await this.archive(q.id, archiverId, archiverName)) archived++
    }
    return { archived }
  },

  countExpiredDeletable(): number {
    return 0
  },

  async findLineItemsForQuote(quoteId: string): Promise<QuoteLineItemRow[]> {
    return supabaseQuoteRepo.findLineItemsForQuote(quoteId)
  },

  async replaceLineItems(quoteId: string, items: CreateQuoteLineItemData[]): Promise<void> {
    await supabaseQuoteRepo.replaceLineItems(quoteId, toLineItemRows(quoteId, items))
  },

  async syncFromSqlite(id: string): Promise<QuoteRow | null> {
    return supabaseQuoteRepo.findUnique(id)
  },

  async stats() {
    return supabaseQuoteRepo.stats()
  },

  async expirePastDue(): Promise<QuoteRow[]> {
    const asOf = todayIsoDate()
    const n = await supabaseQuoteRepo.expirePastDue(asOf)
    // Callers only use .length; full rows aren't required on the Supabase-only path.
    return Array.from({ length: n }, () => ({}) as QuoteRow)
  },

  async countExpiringSoon(): Promise<number> {
    const asOf = todayIsoDate()
    const through = addDaysToIsoDate(new Date(asOf + "T00:00:00"), 7)
    return supabaseQuoteRepo.countExpiringSoon(asOf, through)
  },
}
