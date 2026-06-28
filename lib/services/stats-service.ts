/**
 * Dashboard aggregates — uses Supabase when job/quote/hold/billing flags are on.
 */
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { holdService } from "@/lib/services/hold-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"

export const statsService = {
  async dashboard() {
    const [
      byStatus,
      byItemType,
      recentJobs,
      unassigned,
      totalActiveJobs,
      totalRevisions,
      jobValues,       // replaces 3 separate totalQuotedValue/totalIssuedValue/avgJobValue calls
      handoffStats,
      clientsOnHold,
      deadlines,
      qStats,
    ] = await Promise.all([
      jobService.groupByStatus(),
      jobService.groupByItemType(),
      jobService.findRecent(6),
      jobService.countWhere({ unassigned: true }),
      jobService.countWhere({ onlyOriginals: true }),
      jobService.countWhere({ onlyRevisions: true }),
      jobService.jobValueStats(),  // single round trip instead of three
      billingHandoffService.stats(),
      holdService.allActive(),      // full list — dashboard uses it directly, removes a /api/hold-list call
      jobService.deadlineStats(),
      quoteService.stats(),
    ])

    return {
      byStatus,
      byItemType,
      recentJobs,
      unassigned,
      totalActiveJobs,
      totalRevisions,
      totalQuotedValue: jobValues.totalQuotedValue,
      totalIssuedValue: jobValues.totalIssuedValue,
      avgJobValue:      jobValues.avgJobValue,
      handoffStats,
      holds: clientsOnHold,
      clientsOnHold: clientsOnHold.length,
      deadlines,
      qStats,
    }
  },
}
