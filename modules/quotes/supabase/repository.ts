/**
 * lib/supabase/repositories/quotes.ts
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { aggSum } from "@/lib/supabase/aggregates"
import { QUOTE_STATUSES } from "@/lib/types"
import type {
  QuoteLineItemRow,
  QuoteListOptions,
  QuoteRow,
} from "../types/quote-types"
import {
  quotesArchivedFilterEnabled,
  noteQuotesArchivedFromError,
} from "@/lib/supabase/archived-filter"
import {
  toQuoteLineItemRow,
  toQuoteRow,
  toSupabaseLineItemRow,
  toSupabaseQuoteRow,
  type SupabaseQuoteRow,
} from "./mapper"

function quotesTable() {
  return createAdminClient().from("quotes")
}

function lineItemsTable() {
  return createAdminClient().from("quote_line_items")
}

function throwSupabaseError(error: { message?: string; details?: string; hint?: string; code?: string } | null): void {
  if (!error) return
  const msg = [error.message, error.details, error.hint, error.code ? `(${error.code})` : null]
    .filter(Boolean)
    .join(" — ")
  throw new Error(msg || "Supabase request failed")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QuoteQuery = any

export interface QuoteListOptionsExt extends QuoteListOptions {
  includeArchived?: boolean
  onlyArchived?: boolean
}

function applyQuoteFilters(q: QuoteQuery, opts: QuoteListOptionsExt): QuoteQuery {
  // Soft-delete filter (requires 011_soft_delete.sql).
  if (quotesArchivedFilterEnabled()) {
    if (opts.onlyArchived)           q = q.not("archived_at", "is", null)
    else if (!opts.includeArchived)  q = q.is("archived_at", null)
  }

  if (opts.search) {
    const term = opts.search.trim()
    q = q.or(
      [
        `quote_number.ilike.%${term}%`,
        `client_company.ilike.%${term}%`,
        `address.ilike.%${term}%`,
        `description.ilike.%${term}%`,
      ].join(","),
    )
  }
  if (opts.status) q = q.eq("status", opts.status)
  if (opts.clientId) q = q.eq("client_id", opts.clientId)
  return q
}

export const supabaseQuoteRepo = {
  async findMany(opts: QuoteListOptions = {}): Promise<QuoteRow[]> {
    const run = () => {
      let q = applyQuoteFilters(quotesTable().select("*"), opts).order("created_at", { ascending: false })
      if (opts.skip != null && opts.take != null) {
        q = q.range(opts.skip, opts.skip + opts.take - 1)
      } else if (opts.take != null) {
        q = q.limit(opts.take)
      }
      return q
    }
    let { data, error } = await run()
    if (error && noteQuotesArchivedFromError(error)) {
      ;({ data, error } = await run())
    }
    if (error) throw error
    return (data ?? []).map(toQuoteRow)
  },

  async count(opts: QuoteListOptions = {}): Promise<number> {
    const run = () =>
      applyQuoteFilters(
        quotesTable().select("*", { count: "exact", head: true }),
        opts,
      )
    let { count, error } = await run()
    if (error && noteQuotesArchivedFromError(error)) {
      ;({ count, error } = await run())
    }
    if (error) throw error
    return count ?? 0
  },

  async findUnique(id: string): Promise<QuoteRow | null> {
    const { data, error } = await quotesTable().select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return data ? toQuoteRow(data) : null
  },

  async findByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    const { data, error } = await quotesTable().select("*").eq("quote_number", quoteNumber).maybeSingle()
    if (error) throw error
    return data ? toQuoteRow(data) : null
  },

  async upsert(quote: QuoteRow): Promise<void> {
    const { error } = await quotesTable().upsert(toSupabaseQuoteRow(quote), { onConflict: "id" })
    if (error) throwSupabaseError(error)
  },

  async updatePdfPath(id: string, pdfPath: string | null): Promise<void> {
    const { error } = await quotesTable()
      .update({ pdf_path: pdfPath, updated_at: new Date().toISOString() })
      .eq("id", id)
    throwSupabaseError(error)
  },

  async upsertMany(quotes: QuoteRow[]): Promise<void> {
    if (!quotes.length) return
    const { error } = await quotesTable().upsert(
      quotes.map(toSupabaseQuoteRow),
      { onConflict: "id" },
    )
    if (error) throw error
  },

  /** Excel import — upsert by quote_number so a retry after partial import still succeeds. */
  async upsertManyForImport(quotes: QuoteRow[]): Promise<void> {
    if (!quotes.length) return
    const { error } = await quotesTable().upsert(
      quotes.map(toSupabaseQuoteRow),
      { onConflict: "quote_number" },
    )
    if (error) throw error
  },

  async delete(id: string): Promise<boolean> {
    const { error, count } = await quotesTable().delete({ count: "exact" }).eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async archive(id: string, archivedBy: string, archivedAt: string): Promise<boolean> {
    const { error, count } = await quotesTable()
      .update({ archived_at: archivedAt, archived_by: archivedBy, updated_at: archivedAt }, { count: "exact" })
      .eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async restore(id: string, restoredAt: string): Promise<boolean> {
    const { error, count } = await quotesTable()
      .update({ archived_at: null, archived_by: null, updated_at: restoredAt }, { count: "exact" })
      .eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
  },

  async findArchived(): Promise<QuoteRow[]> {
    const { data, error } = await quotesTable()
      .select("*")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
    if (error) {
      if (noteQuotesArchivedFromError(error)) {
        console.error("[supabaseQuoteRepo.findArchived] archived_at column missing — run 011_soft_delete.sql")
        return []
      }
      throw error
    }
    return ((data ?? []) as SupabaseQuoteRow[]).map(toQuoteRow)
  },

  /** EXPIRED quotes never converted to a job — candidates for bulk archive. */
  async findExpiredArchivable(): Promise<QuoteRow[]> {
    const run = () =>
      applyQuoteFilters(
        quotesTable()
          .select("*")
          .eq("status", "EXPIRED")
          .is("job_id", null),
        { includeArchived: false },
      )
    let { data, error } = await run()
    if (error && noteQuotesArchivedFromError(error)) {
      ;({ data, error } = await run())
    }
    if (error) throw error
    return (data ?? []).map(toQuoteRow)
  },

  async findLineItemsForQuote(quoteId: string): Promise<QuoteLineItemRow[]> {
    const { data, error } = await lineItemsTable()
      .select("*")
      .eq("quote_id", quoteId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) throw error
    return (data ?? []).map(toQuoteLineItemRow)
  },

  async replaceLineItems(quoteId: string, items: QuoteLineItemRow[]): Promise<void> {
    const { error: delError } = await lineItemsTable().delete().eq("quote_id", quoteId)
    if (delError) throw delError
    if (!items.length) return
    const { error } = await lineItemsTable().insert(items.map(toSupabaseLineItemRow))
    if (error) throw error
  },

  /** Mirror after SQLite replaceForQuote — reads fresh rows from SQLite caller. */
  async mirrorLineItems(items: QuoteLineItemRow[]): Promise<void> {
    if (!items.length) return
    const quoteId = items[0].quoteId
    await this.replaceLineItems(quoteId, items)
  },

  async expirePastDue(asOf: string): Promise<number> {
    const { data, error } = await quotesTable()
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .in("status", ["DRAFT", "SENT"])
      .not("expiry_date", "is", null)
      .lt("expiry_date", asOf)
      .select("id")
    if (error) throw error
    return data?.length ?? 0
  },

  async countExpiringSoon(asOf: string, through: string): Promise<number> {
    const { count, error } = await quotesTable()
      .select("*", { count: "exact", head: true })
      .in("status", ["DRAFT", "SENT"])
      .not("expiry_date", "is", null)
      .gte("expiry_date", asOf)
      .lte("expiry_date", through)
    if (error) throw error
    return count ?? 0
  },

  async stats(): Promise<{
    total: number
    draft: number
    sent: number
    accepted: number
    rejected: number
    expired: number
    totalValue: number
    acceptedValue: number
    conversionRate: number
  }> {
    const statuses = QUOTE_STATUSES.map(s => s.value)
    const rows = await Promise.all(
      statuses.map(async status => {
        const runCount = () =>
          applyQuoteFilters(
            quotesTable().select("*", { count: "exact", head: true }),
            { status },
          )
        const runSum = () =>
          applyQuoteFilters(
            quotesTable().select("quote_value.sum()"),
            { status },
          ).maybeSingle()

        let [countRes, sumRes] = await Promise.all([runCount(), runSum()])
        const err = countRes.error ?? sumRes.error
        if (err && noteQuotesArchivedFromError(err)) {
          ;[countRes, sumRes] = await Promise.all([runCount(), runSum()])
        }
        if (countRes.error) throw countRes.error
        if (sumRes.error) throw sumRes.error
        return { status, n: countRes.count ?? 0, v: aggSum(sumRes.data) }
      }),
    )
    const cnt = (s: string) => rows.find(r => r.status === s)?.n ?? 0
    const val = (s: string) => rows.find(r => r.status === s)?.v ?? 0
    const accepted = cnt("ACCEPTED")
    const rejected = cnt("REJECTED")
    const decided  = accepted + rejected
    return {
      total:          rows.reduce((a, b) => a + b.n, 0),
      draft:          cnt("DRAFT"),
      sent:           cnt("SENT"),
      accepted,
      rejected,
      expired:        cnt("EXPIRED"),
      totalValue:     rows.reduce((a, b) => a + b.v, 0),
      acceptedValue:  val("ACCEPTED"),
      conversionRate: decided > 0 ? accepted / decided : 0,
    }
  },

  /** Returns the highest quote/batch sequence per prefix+year (e.g. Q/2026 → 12). */
  async maxQuoteRefSequences(): Promise<{ prefix: string; year: number; maxSeq: number }[]> {
    const { data, error } = await quotesTable().select("quote_number")
    if (error) return []
    const maxByKey = new Map<string, number>()
    for (const row of (data ?? [])) {
      const match = (row.quote_number as string | null)?.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
      if (!match) continue
      const [, prefix, yearStr, nnn] = match
      const mapKey = `${prefix}||${yearStr}`
      const seq = parseInt(nnn, 10)
      const prev = maxByKey.get(mapKey) ?? 0
      if (seq > prev) maxByKey.set(mapKey, seq)
    }
    return Array.from(maxByKey.entries()).map(([mapKey, maxSeq]) => {
      const [prefix, yearStr] = mapKey.split("||")
      return { prefix, year: parseInt(yearStr, 10), maxSeq }
    })
  },
}
