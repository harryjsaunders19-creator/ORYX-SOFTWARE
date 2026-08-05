/**
 * lib/supabase/repositories/quotes.ts
 */
import { createAdminClient } from "@/shared/supabase/admin"
import { QUOTE_STATUSES } from "@/lib/types"
import type {
  QuoteLineItemRow,
  QuoteListOptions,
  QuoteRow,
} from "../types/quote-types"
import {
  quotesArchivedFilterEnabled,
  noteQuotesArchivedFromError,
} from "@/shared/supabase/archived-filter"
import { postgrestOrIlike } from "@/shared/supabase/postgrest-filter"
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

/** Perf: list payloads don't need every column — same QuoteRow via toQuoteRow. */
const QUOTE_LIST_SELECT = [
  "id", "quote_number", "client_id", "client_company", "contact_name", "address",
  "description", "type_of_works", "custom_type_description", "quote_value",
  "quote_date", "expiry_date", "status", "notes", "job_id", "parent_job_id", "created_by",
  "pdf_path", "prepared_by", "vat_rate", "archived_at", "archived_by",
  "created_at", "updated_at",
].join(",")

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
    const orFilter = postgrestOrIlike(
      ["quote_number", "client_company", "address", "description"],
      opts.search,
    )
    if (orFilter) q = q.or(orFilter)
  }
  if (opts.status) q = q.eq("status", opts.status)
  if (opts.clientId) q = q.eq("client_id", opts.clientId)
  if (opts.jobIds?.length) q = q.in("job_id", opts.jobIds)
  return q
}

export const supabaseQuoteRepo = {
  async findMany(opts: QuoteListOptions = {}): Promise<QuoteRow[]> {
    const run = () => {
      let q = applyQuoteFilters(quotesTable().select(QUOTE_LIST_SELECT), opts).order("created_at", { ascending: false })
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
    return ((data ?? []) as unknown as SupabaseQuoteRow[]).map(toQuoteRow)
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

  /** Bulk-fetch quotes by quote_number — one query instead of N. */
  async findManyByNumbers(quoteNumbers: string[]): Promise<QuoteRow[]> {
    const unique = [...new Set(quoteNumbers.filter(Boolean))]
    if (!unique.length) return []
    const { data, error } = await quotesTable().select("*").in("quote_number", unique)
    if (error) throw error
    return (data ?? []).map(toQuoteRow)
  },

  async upsert(quote: QuoteRow): Promise<void> {
    const { error } = await quotesTable().upsert(toSupabaseQuoteRow(quote), { onConflict: "id" })
    if (error) throwSupabaseError(error)
  },

  async findByJobIds(jobIds: string[]): Promise<QuoteRow[]> {
    if (!jobIds.length) return []
    let q = quotesTable().select("*").in("job_id", jobIds).order("updated_at", { ascending: false })
    if (quotesArchivedFilterEnabled()) q = q.is("archived_at", null)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toQuoteRow)
  },

  async setJobId(quoteId: string, jobId: string | null): Promise<QuoteRow | null> {
    const { data, error } = await quotesTable()
      .update({ job_id: jobId, updated_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select("*")
      .maybeSingle()
    if (error) throwSupabaseError(error)
    return data ? toQuoteRow(data) : null
  },

  /** Link quote to job only when not already converted (idempotent under concurrency). */
  async linkJobId(quoteId: string, jobId: string): Promise<QuoteRow | null> {
    const { data, error } = await quotesTable()
      .update({ job_id: jobId, updated_at: new Date().toISOString() })
      .eq("id", quoteId)
      .is("job_id", null)
      .select("*")
      .maybeSingle()
    if (error) throwSupabaseError(error)
    return data ? toQuoteRow(data) : null
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
    try {
      const { data, error } = await createAdminClient().rpc("quote_stats_agg")
      if (!error && data && typeof data === "object") {
        const d = data as Record<string, unknown>
        return {
          total:          Number(d.total) || 0,
          draft:          Number(d.draft) || 0,
          sent:           Number(d.sent) || 0,
          accepted:       Number(d.accepted) || 0,
          rejected:       Number(d.rejected) || 0,
          expired:        Number(d.expired) || 0,
          totalValue:     Number(d.totalValue) || 0,
          acceptedValue:  Number(d.acceptedValue) || 0,
          conversionRate: Number(d.conversionRate) || 0,
        }
      }
    } catch {
      // Fall through to paginated scan.
    }

    // Perf: paginated slim status+value scan (avoids PostgREST 1000-row cap).
    const pageSize = 1000
    const counts = new Map<string, number>()
    const values = new Map<string, number>()
    for (let from = 0; ; from += pageSize) {
      const run = () =>
        applyQuoteFilters(quotesTable().select("status,quote_value"), {})
          .range(from, from + pageSize - 1)
      let { data, error } = await run()
      if (error && noteQuotesArchivedFromError(error)) {
        ;({ data, error } = await run())
      }
      if (error) throw error
      if (!data?.length) break
      for (const row of data) {
        const status = row.status as string
        counts.set(status, (counts.get(status) ?? 0) + 1)
        const qv = row.quote_value != null ? Number(row.quote_value) : 0
        values.set(status, (values.get(status) ?? 0) + qv)
      }
      if (data.length < pageSize) break
    }

    const cnt = (s: string) => counts.get(s) ?? 0
    const val = (s: string) => values.get(s) ?? 0
    const accepted = cnt("ACCEPTED")
    const rejected = cnt("REJECTED")
    const decided  = accepted + rejected
    let total = 0
    let totalValue = 0
    for (const s of QUOTE_STATUSES.map(x => x.value)) {
      total += cnt(s)
      totalValue += val(s)
    }

    return {
      total,
      draft:          cnt("DRAFT"),
      sent:           cnt("SENT"),
      accepted,
      rejected,
      expired:        cnt("EXPIRED"),
      totalValue,
      acceptedValue:  val("ACCEPTED"),
      conversionRate: decided > 0 ? accepted / decided : 0,
    }
  },

  /** Returns the highest quote/batch sequence per prefix+year (e.g. Q/2026 → 12). */
  async maxQuoteRefSequences(): Promise<{ prefix: string; year: number; maxSeq: number }[]> {
    const maxByKey = new Map<string, number>()
    const pageSize = 1000
    try {
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await quotesTable()
          .select("quote_number")
          .range(from, from + pageSize - 1)
        if (error) return []
        if (!data?.length) break
        for (const row of data) {
          const match = (row.quote_number as string | null)?.match(/^([A-Z]+)-(\d{4})-(\d+)$/)
          if (!match) continue
          const [, prefix, yearStr, nnn] = match
          const mapKey = `${prefix}||${yearStr}`
          const seq = parseInt(nnn, 10)
          const prev = maxByKey.get(mapKey) ?? 0
          if (seq > prev) maxByKey.set(mapKey, seq)
        }
        if (data.length < pageSize) break
      }
    } catch {
      return []
    }
    return Array.from(maxByKey.entries()).map(([mapKey, maxSeq]) => {
      const [prefix, yearStr] = mapKey.split("||")
      return { prefix, year: parseInt(yearStr, 10), maxSeq }
    })
  },
}
