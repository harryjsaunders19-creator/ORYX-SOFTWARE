import { NextResponse } from "next/server"
import { listResponse } from "@/lib/api-cache"
import { statsService } from "@/lib/services/stats-service"
import { requireSignIn } from "@/lib/auth"
import { canViewCommercialValues } from "@/lib/permissions"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const role    = auth.user.role as import("@/lib/permissions").Role
    const canView = canViewCommercialValues(role)

    const {
      byStatus, byItemType, recentJobs, unassigned, totalActiveJobs, totalRevisions,
      totalQuotedValue, totalIssuedValue, avgJobValue, handoffStats,
      holds, clientsOnHold,
      deadlines, qStats,
    } = await statsService.dashboard()

    const count = (status: string) => byStatus.find(s => s.status === status)?.count ?? 0
    const total = byStatus.reduce((a, b) => a + b.count, 0)

    return listResponse({
      total, totalActiveJobs, totalRevisions,
      newRequest: count("NEW_REQUEST"),
      inDesign:   count("IN_DESIGN"),
      checking:   count("CHECKING"),
      issued:     count("ISSUED"),
      unassigned,
      totalQuotedValue: canView ? totalQuotedValue : null,
      totalIssuedValue: canView ? totalIssuedValue : null,
      avgJobValue:      canView ? avgJobValue      : null,
      clientsOnHold,
      holds,
      overdueCount:       deadlines.overdueCount,
      dueTodayCount:      deadlines.dueTodayCount,
      dueThisWeekCount:   deadlines.dueThisWeekCount,
      readyForInvoicingCount:   canView ? handoffStats.awaitingCount : null,
      readyForInvoicingValue:   canView ? handoffStats.awaitingValue : null,
      clearedForInvoicingCount: canView ? handoffStats.clearedCount  : null,
      quotesSent:           qStats.sent,
      quotesAccepted:       qStats.accepted,
      quotesRejected:       qStats.rejected,
      quotesTotalValue:     canView ? qStats.totalValue : null,
      quotesWonValue:       canView ? qStats.acceptedValue : null,
      quotesConversionRate: qStats.conversionRate,
      byItemType,
      byStatus,
      recentJobs,
    })
  } catch (err) {
    console.error("[GET /api/stats]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
