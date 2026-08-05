import type { Role } from "@/shared/auth/permissions"
import { canViewCommercialValues } from "@/shared/auth/permissions"
import { statsService } from "../services/stats-service"
import type { StatsData } from "../types/stats-types"

/** Shared dashboard payload for GET /api/stats and RSC seeding. */
export async function buildDashboardStats(opts: {
  role: Role
  calendarFrom?: string
  calendarTo?: string
}): Promise<StatsData> {
  const canView = canViewCommercialValues(opts.role)
  const {
    byStatus, byItemType, recentJobs, unassigned, totalActiveJobs, totalRevisions,
    totalQuotedValue, totalIssuedValue, avgJobValue, handoffStats,
    holds, clientsOnHold, overdueJobs, weekEvents,
    deadlines, qStats,
  } = await statsService.dashboard({
    calendarFrom: opts.calendarFrom,
    calendarTo: opts.calendarTo,
    includeBilling: canView,
  })

  const count = (status: string) => byStatus.find(s => s.status === status)?.count ?? 0
  const total = byStatus.reduce((a, b) => a + b.count, 0)
  const hasCalendar = Boolean(opts.calendarFrom && opts.calendarTo)

  return {
    total, totalActiveJobs, totalRevisions,
    newRequest: count("NEW_REQUEST"),
    inDesign:   count("IN_DESIGN"),
    checking:   count("CHECKING"),
    readyToSend: count("READY_TO_SEND"),
    issued:     count("ISSUED"),
    unassigned,
    totalQuotedValue: canView ? totalQuotedValue : null,
    totalIssuedValue: canView ? totalIssuedValue : null,
    avgJobValue:      canView ? avgJobValue      : null,
    clientsOnHold,
    holds: holds as StatsData["holds"],
    overdueCount:       deadlines.overdueCount,
    dueTodayCount:      deadlines.dueTodayCount,
    dueThisWeekCount:   deadlines.dueThisWeekCount,
    readyForInvoicingCount:   canView ? handoffStats.awaitingCount : null,
    // Dashboard KPI shows item counts only — no monetary values on the home page.
    readyForInvoicingValue:   null,
    clearedForInvoicingCount: canView ? handoffStats.clearedCount  : null,
    quotesSent:           qStats.sent,
    quotesAccepted:       qStats.accepted,
    quotesRejected:       qStats.rejected,
    quotesTotalValue:     canView ? qStats.totalValue : null,
    quotesWonValue:       canView ? qStats.acceptedValue : null,
    quotesConversionRate: qStats.conversionRate,
    byItemType,
    byStatus,
    recentJobs: recentJobs as StatsData["recentJobs"],
    overdueJobs: hasCalendar ? (overdueJobs as StatsData["overdueJobs"]) : undefined,
    weekEvents:  hasCalendar ? (weekEvents as StatsData["weekEvents"]) : undefined,
  }
}
