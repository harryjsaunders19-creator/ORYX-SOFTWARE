/**
 * Backfill Ready-for-Invoicing handoff rows that still have a null price
 * when a Quote is already attached to the source job.
 */
import type { BillingHandoffRow } from "./types"
import {
  loadLinkedQuotesByJobIds,
  resolveHandoffQuoteValue,
} from "./resolve-handoff-quote-value"

type UpdateFn = (
  handoffId: string,
  quoteValue: number,
  quoteReference?: string | null,
) => Promise<BillingHandoffRow | { error: string } | void>

/**
 * For awaiting handoffs with no quoteValue, resolve from linked quotes and
 * persist when an `update` callback is provided. Always returns the enriched
 * list for display even if persistence fails.
 */
export async function enrichHandoffsWithLinkedQuoteValues(
  handoffs: BillingHandoffRow[],
  update?: UpdateFn,
): Promise<BillingHandoffRow[]> {
  const missing = handoffs.filter(h => h.quoteValue == null && !h.clearedByAccountsAt)
  if (!missing.length) return handoffs

  const linkedByJob = await loadLinkedQuotesByJobIds(missing.map(h => h.sourceJobId))
  const byId = new Map(handoffs.map(h => [h.id, h]))

  for (const h of missing) {
    const resolved = resolveHandoffQuoteValue(
      { quoteValue: null, quoteReference: h.quoteReference },
      linkedByJob.get(h.sourceJobId) ?? [],
    )
    if (resolved.quoteValue == null) continue

    let next: BillingHandoffRow = {
      ...h,
      quoteValue: resolved.quoteValue,
      quoteReference: resolved.quoteReference ?? h.quoteReference,
    }

    if (update) {
      try {
        const saved = await update(h.id, resolved.quoteValue, resolved.quoteReference)
        if (saved && !("error" in saved)) next = saved
      } catch {
        // Keep in-memory enrichment so the UI still shows the linked price.
      }
    }

    byId.set(h.id, next)
  }

  return handoffs.map(h => byId.get(h.id) ?? h)
}
