/**
 * Dashboard aggregates — uses Supabase when job/quote/hold/billing flags are on.
 */
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { holdService } from "@/lib/services/hold-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { errorMessage } from "@/lib/error-message"

const EMPTY_HANDOFF_STATS = { awaitingCount: 0, awaitingValue: 0, clearedCount: 0 }

const EMPTY_QUOTE_STATS = {
  total: 0,
  draft: 0,
  sent: 0,
  accepted: 0,
  rejected: 0,
  expired: 0,
  totalValue: 0,
  acceptedValue: 0,
  conversionRate: 0,
}

async function tryStat<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.error(`[statsService] ${label} failed:`, errorMessage(err))
    return fallback
  }
}

export const statsService = {
  async dashboard() {
    // dashboardCounts() replaces 8 separate job-count queries with one Supabase
    // call (groupByStatus, groupByItemType, 3×countWhere, 3×deadlineStats counts).
    const [counts, recentJobs, jobValues, handoffStats, allHolds, qStats] = await Promise.all([
      jobService.dashboardCounts(),
      tryStat("recentJobs", () => jobService.findRecent(6), []),
      tryStat(
        "jobValueStats",
        () => jobService.jobValueStats(),
        { totalQuotedValue: 0, totalIssuedValue: 0, avgJobValue: 0 },
      ),
      tryStat("billingHandoffStats", () => billingHandoffService.stats(), EMPTY_HANDOFF_STATS),
      tryStat("clientHolds", () => holdService.allActive(), []),
      tryStat("quoteStats", () => quoteService.stats(), EMPTY_QUOTE_STATS),
    ])

    return {
      byStatus:        counts.byStatus,
      byItemType:      counts.byItemType,
      recentJobs,
      unassigned:      counts.unassigned,
      totalActiveJobs: counts.totalActiveJobs,
      totalRevisions:  counts.totalRevisions,
      totalQuotedValue: jobValues.totalQuotedValue,
      totalIssuedValue: jobValues.totalIssuedValue,
      avgJobValue:      jobValues.avgJobValue,
      handoffStats,
      holds:         allHolds,
      clientsOnHold: allHolds.length,
      deadlines: {
        overdueCount:     counts.overdueCount,
        dueTodayCount:    counts.dueTodayCount,
        dueThisWeekCount: counts.dueThisWeekCount,
      },
      qStats,
    }
  },
}
