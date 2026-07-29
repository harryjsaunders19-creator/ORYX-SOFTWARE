/**
 * Resolve the amount that should appear on a Ready for Invoicing handoff.
 *
 * Prefer the job’s own commercial total (quoteValue + extras). When that is
 * missing — common when a Quote row is attached via quotes.job_id without
 * copying the fee onto the Job — fall back to the linked quote value.
 */
import { totalJobCommercialValue } from "@/shared/utils/utils"

export type LinkedQuoteForInvoice = {
  quoteNumber: string
  quoteValue: number
  status: string
  updatedAt: string
}

export type ResolvedHandoffQuote = {
  quoteValue: number | null
  quoteReference: string | null
  /** True when the amount came from a linked Quote rather than Job.quoteValue. */
  fromLinkedQuote: boolean
}

/** Prefer ACCEPTED quotes, otherwise most recently updated. */
export function pickLinkedQuoteForInvoice(
  quotes: LinkedQuoteForInvoice[],
): LinkedQuoteForInvoice | null {
  if (!quotes.length) return null
  const accepted = quotes.find(q => q.status === "ACCEPTED")
  if (accepted) return accepted
  return [...quotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
}

export function resolveHandoffQuoteValue(
  job: {
    quoteValue?: number | null
    variationFees?: number | null
    additionalCharges?: number | null
    quoteReference?: string | null
  },
  linkedQuotes: LinkedQuoteForInvoice[] = [],
): ResolvedHandoffQuote {
  const commercial = totalJobCommercialValue(job)
  if (commercial != null) {
    return {
      quoteValue: commercial,
      quoteReference: job.quoteReference ?? null,
      fromLinkedQuote: false,
    }
  }

  const linked = pickLinkedQuoteForInvoice(linkedQuotes)
  if (linked && Number.isFinite(linked.quoteValue)) {
    return {
      quoteValue: linked.quoteValue,
      quoteReference: job.quoteReference ?? linked.quoteNumber,
      fromLinkedQuote: true,
    }
  }

  return {
    quoteValue: job.quoteValue ?? null,
    quoteReference: job.quoteReference ?? null,
    fromLinkedQuote: false,
  }
}

/** Async lookup of linked quotes for one or many jobs. */
export async function loadLinkedQuotesByJobIds(
  jobIds: string[],
): Promise<Map<string, LinkedQuoteForInvoice[]>> {
  const map = new Map<string, LinkedQuoteForInvoice[]>()
  if (!jobIds.length) return map
  const { quoteService } = await import("@/modules/quotes")
  const rows = await quoteService.findByJobIds(jobIds)
  for (const q of rows) {
    if (!q.jobId) continue
    const arr = map.get(q.jobId) ?? []
    arr.push({
      quoteNumber: q.quoteNumber,
      quoteValue: q.quoteValue,
      status: q.status,
      updatedAt: q.updatedAt,
    })
    map.set(q.jobId, arr)
  }
  return map
}
