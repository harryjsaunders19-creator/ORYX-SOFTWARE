/**
 * Dashboard aggregates — uses Supabase when job/quote/hold/billing flags are on.
 */
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { holdService } from "@/lib/services/hold-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { calendarService } from "@/lib/services/calendar-service"
import { errorMessage } from "@/lib/error-message"
import type { JobRow } from "@/modules/jobs/types/job-types"
import type { CalendarEventWithDetails } from "@/modules/calendar/types/calendar-types"

export interface DashboardOptions {
  calendarFrom?: string
  calendarTo?: string
}

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
  async dashboard(opts: DashboardOptions = {}) {
    const includeCalendar = !!(opts.calendarFrom && opts.calendarTo)

    // dashboardCounts() — one slim Supabase scan (status/type/designer/parent/deadline)
    // instead of ~16 parallel head-count round-trips. Quote stats similarly collapsed.
    const [counts, recentJobs, jobValues, handoffStats, allHolds, qStats, overdueJobs, weekEvents] = await Promise.all([
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
      includeCalendar
        ? tryStat<JobRow[]>("overdueJobs", () => jobService.findMany({
            where: { overdue: true },
            orderBy: { field: "requiredByDate", dir: "asc" },
            take: 5,
          }), [] as JobRow[])
        : Promise.resolve([] as JobRow[]),
      includeCalendar
        ? tryStat("weekEvents", () => calendarService.findMany({
            from: opts.calendarFrom!,
            to: opts.calendarTo!,
          }), [] as CalendarEventWithDetails[])
        : Promise.resolve([] as CalendarEventWithDetails[]),
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
      overdueJobs,
      weekEvents,
      deadlines: {
        overdueCount:     counts.overdueCount,
        dueTodayCount:    counts.dueTodayCount,
        dueThisWeekCount: counts.dueThisWeekCount,
      },
      qStats,
    }
  },
}
