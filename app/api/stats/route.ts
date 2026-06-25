import { NextResponse } from "next/server"
import { jobDb, commercialDb, billingHandoffDb, holdDb, quoteDb } from "@/lib/db"
import { getCurrentRole } from "@/lib/auth"
import { canViewCommercialValues } from "@/lib/permissions"

export async function GET() {
  try {
    const role     = await getCurrentRole()
    const canView  = canViewCommercialValues(role)

    const [byStatus, byItemType, recentJobs, unassigned, totalActiveJobs, totalRevisions,
           totalQuotedValue, totalIssuedValue, avgJobValue, handoffStats, clientsOnHold, deadlines, qStats] = [
      jobDb.groupByStatus(),
      jobDb.groupByItemType(),
      jobDb.findRecent(6),
      jobDb.countWhere({ unassigned: true }),
      jobDb.countWhere({ onlyOriginals: true }),
      jobDb.countWhere({ onlyRevisions: true }),
      commercialDb.totalQuotedValue(),
      commercialDb.totalIssuedValue(),
      commercialDb.avgJobValue(),
      billingHandoffDb.stats(),
      holdDb.activeCount(),
      jobDb.deadlineStats(),
      quoteDb.stats(),
    ]

    const count = (status: string) => byStatus.find(s => s.status === status)?.count ?? 0
    const total = byStatus.reduce((a, b) => a + b.count, 0)

    return NextResponse.json({
      total, totalActiveJobs, totalRevisions,
      newRequest: count("NEW_REQUEST"),
      inDesign:   count("IN_DESIGN"),
      checking:   count("CHECKING"),
      issued:     count("ISSUED"),
      unassigned,
      // Commercial Dashboard (Admin-only module)
      totalQuotedValue: canView ? totalQuotedValue : null,
      totalIssuedValue: canView ? totalIssuedValue : null,
      avgJobValue:      canView ? avgJobValue      : null,
      clientsOnHold,
      overdueCount:       deadlines.overdueCount,
      dueTodayCount:      deadlines.dueTodayCount,
      dueThisWeekCount:   deadlines.dueThisWeekCount,
      // Ready For Invoicing (Admin-only module)
      readyForInvoicingCount:   canView ? handoffStats.awaitingCount : null,
      readyForInvoicingValue:   canView ? handoffStats.awaitingValue : null,
      clearedForInvoicingCount: canView ? handoffStats.clearedCount  : null,
      // Quote module — counts visible to both roles, monetary totals admin-only
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
