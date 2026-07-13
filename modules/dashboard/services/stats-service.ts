/**
 * Dashboard aggregates — uses Supabase when job/quote/hold/billing flags are on.
 *
 * Perf: only load what the home dashboard renders. Commercial quote/job value
 * aggregates and recent-jobs lists are omitted (not shown on the page).
 */
import { jobService } from "@/lib/services/job-service"
import { holdService } from "@/lib/services/hold-service"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { calendarService } from "@/lib/services/calendar-service"
import { errorMessage } from "@/lib/error-message"
import type { JobRow } from "@/modules/jobs/types/job-types"
import type { CalendarEventWithDetails } from "@/modules/calendar/types/calendar-types"

export interface DashboardOptions {
  calendarFrom?: string
  calendarTo?: string
  /** Admin-only invoicing KPI (engineers skip the billing round-trip). */
  includeBilling?: boolean
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

const DASHBOARD_CALENDAR_CATEGORIES = ["cat_site_visit", "cat_teams_meeting"]

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
    const includeBilling = opts.includeBilling === true

    // dashboardCounts() — one slim Supabase scan / RPC instead of many head counts.
    const [counts, handoffStats, holdsPreview, holdsCount, overdueJobs, weekEvents] = await Promise.all([
      jobService.dashboardCounts(),
      includeBilling
        ? tryStat("billingAwaitingCount", async () => {
            const awaitingCount = await billingHandoffService.awaitingCount()
            return { awaitingCount, awaitingValue: 0, clearedCount: 0 }
          }, EMPTY_HANDOFF_STATS)
        : Promise.resolve(EMPTY_HANDOFF_STATS),
      tryStat("clientHoldsPreview", () => holdService.allActivePreview(5), []),
      tryStat("clientHoldsCount", () => holdService.activeCount(), 0),
      includeCalendar
        ? tryStat<JobRow[]>("overdueJobs", () => jobService.findOverduePreview(5), [] as JobRow[])
        : Promise.resolve([] as JobRow[]),
      includeCalendar
        ? tryStat("weekEvents", () => calendarService.findMany({
            from: opts.calendarFrom!,
            to: opts.calendarTo!,
            categoryIds: DASHBOARD_CALENDAR_CATEGORIES,
          }), [] as CalendarEventWithDetails[])
        : Promise.resolve([] as CalendarEventWithDetails[]),
    ])

    return {
      byStatus:        counts.byStatus,
      byItemType:      counts.byItemType,
      recentJobs:      [],
      unassigned:      counts.unassigned,
      totalActiveJobs: counts.totalActiveJobs,
      totalRevisions:  counts.totalRevisions,
      totalQuotedValue: 0,
      totalIssuedValue: 0,
      avgJobValue:      0,
      handoffStats,
      holds:         holdsPreview,
      clientsOnHold: holdsCount,
      overdueJobs,
      weekEvents,
      deadlines: {
        overdueCount:     counts.overdueCount,
        dueTodayCount:    counts.dueTodayCount,
        dueThisWeekCount: counts.dueThisWeekCount,
      },
      qStats: EMPTY_QUOTE_STATS,
    }
  },
}
