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
      totalQuotedValue,
      totalIssuedValue,
      avgJobValue,
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
      jobService.totalQuotedValue(),
      jobService.totalIssuedValue(),
      jobService.avgJobValue(),
      billingHandoffService.stats(),
      holdService.activeCount(),
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
      totalQuotedValue,
      totalIssuedValue,
      avgJobValue,
      handoffStats,
      clientsOnHold,
      deadlines,
      qStats,
    }
  },
}
