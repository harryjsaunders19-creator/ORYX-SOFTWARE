/**
 * Dashboard aggregates — uses Supabase when job/quote/hold/billing flags are on.
 */
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { holdService } from "@/lib/services/hold-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"

export const statsService = {
  async dashboard() {
    // dashboardCounts() replaces 8 separate job-count queries with one Supabase
    // call (groupByStatus, groupByItemType, 3×countWhere, 3×deadlineStats counts).
    const [counts, recentJobs, jobValues, handoffStats, allHolds, qStats] = await Promise.all([
      jobService.dashboardCounts(),
      jobService.findRecent(6),
      jobService.jobValueStats(),
      billingHandoffService.stats(),
      holdService.allActive(),
      quoteService.stats(),
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
