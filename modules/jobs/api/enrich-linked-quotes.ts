/**
 * Batch-enrich Job rows with linked quote summaries from quotes.job_id.
 * Used by the list and detail API to provide live quote data on job cards.
 */
import type { LinkedQuoteSummary } from "@/lib/types"

interface QuoteLike {
  id: string
  quoteNumber: string
  quoteValue: number
  status: string
  jobId: string | null
  updatedAt: string
}

function toSummary(q: QuoteLike): LinkedQuoteSummary {
  return { id: q.id, quoteNumber: q.quoteNumber, quoteValue: q.quoteValue, status: q.status, updatedAt: q.updatedAt }
}

/** Pick "current" quote: accepted first, then most recently updated. */
function pickCurrent(quotes: QuoteLike[]): LinkedQuoteSummary | null {
  if (!quotes.length) return null
  const accepted = quotes.find(q => q.status === "ACCEPTED")
  return toSummary(accepted ?? quotes[0])
}

export async function enrichJobsWithLinkedQuotes<T extends { id: string }>(
  jobs: T[],
): Promise<(T & { linkedQuotes: LinkedQuoteSummary[]; currentQuote: LinkedQuoteSummary | null })[]> {
  if (!jobs.length) return jobs as never[]
  const jobIds = jobs.map(j => j.id)
  const { quoteService } = await import("@/modules/quotes")
  const rows = await quoteService.findByJobIds(jobIds)

  const byJobId = new Map<string, QuoteLike[]>()
  for (const q of rows) {
    if (!q.jobId) continue
    const arr = byJobId.get(q.jobId) ?? []
    arr.push(q)
    byJobId.set(q.jobId, arr)
  }

  return jobs.map(job => {
    const quotes = byJobId.get(job.id) ?? []
    return {
      ...job,
      linkedQuotes: quotes.map(toSummary),
      currentQuote: pickCurrent(quotes),
    }
  })
}
