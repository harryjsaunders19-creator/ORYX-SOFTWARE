/**
 * lib/supabase/repositories/quotes.ts
 */
import { createAdminClient } from "@/lib/supabase/admin"
import type {
  CreateQuoteLineItemData,
  QuoteLineItemRow,
  QuoteListOptions,
  QuoteRow,
} from "@/lib/db/quote-types"
import {
  toQuoteLineItemRow,
  toQuoteRow,
  toSupabaseLineItemRow,
  toSupabaseQuoteRow,
} from "@/lib/supabase/mappers/quote"

function quotesTable() {
  return createAdminClient().from("quotes")
}

function lineItemsTable() {
  return createAdminClient().from("quote_line_items")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QuoteQuery = any

function applyQuoteFilters(q: QuoteQuery, opts: QuoteListOptions): QuoteQuery {
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
    let q = applyQuoteFilters(quotesTable().select("*"), opts).order("created_at", { ascending: false })
    if (opts.skip != null && opts.take != null) {
      q = q.range(opts.skip, opts.skip + opts.take - 1)
    } else if (opts.take != null) {
      q = q.limit(opts.take)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(toQuoteRow)
  },

  async count(opts: QuoteListOptions = {}): Promise<number> {
    const { count, error } = await applyQuoteFilters(
      quotesTable().select("*", { count: "exact", head: true }),
      opts,
    )
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
    if (error) throw error
  },

  async delete(id: string): Promise<boolean> {
    const { error, count } = await quotesTable().delete({ count: "exact" }).eq("id", id)
    if (error) throw error
    return (count ?? 0) > 0
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
    const { data, error } = await quotesTable().select("status, quote_value")
    if (error) throw error
    const rows = new Map<string, { n: number; v: number }>()
    for (const row of data ?? []) {
      const status = row.status as string
      const cur = rows.get(status) ?? { n: 0, v: 0 }
      cur.n += 1
      cur.v += Number(row.quote_value ?? 0)
      rows.set(status, cur)
    }
    const cnt = (s: string) => rows.get(s)?.n ?? 0
    const val = (s: string) => rows.get(s)?.v ?? 0
    const accepted = cnt("ACCEPTED")
    const rejected = cnt("REJECTED")
    const decided = accepted + rejected
    let total = 0
    let totalValue = 0
    for (const { n, v } of rows.values()) {
      total += n
      totalValue += v
    }
    return {
      total,
      draft: cnt("DRAFT"),
      sent: cnt("SENT"),
      accepted,
      rejected,
      expired: cnt("EXPIRED"),
      totalValue,
      acceptedValue: val("ACCEPTED"),
      conversionRate: decided > 0 ? accepted / decided : 0,
    }
  },
}
