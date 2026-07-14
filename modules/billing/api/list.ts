import { NextRequest, NextResponse } from "next/server"
import { billingHandoffService } from "../services/billing-handoff-service"
import { requireRole } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"

export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const sp = req.nextUrl.searchParams

    // Single-job lookup — used by the job detail page to show whether (and
    // how) a specific job's completion has been handed off.
    const sourceJobId = sp.get("sourceJobId")
    if (sourceJobId) {
      const handoff = await billingHandoffService.findBySourceJobId(sourceJobId)
      return NextResponse.json({ handoff })
    }

    const view = sp.get("view") // "awaiting" | "cleared" | omitted = all
    const cleared = view === "cleared" ? true : view === "awaiting" ? false : undefined
    const page = parsePageParam(sp.get("page"))
    const limit = parseLimitParam(sp.get("limit"), 200, 200)
    const skip = (page - 1) * limit

    const [handoffs, stats] = await Promise.all([
      billingHandoffService.findMany({ cleared, skip, take: limit }),
      billingHandoffService.stats(),
    ])
    const viewTotal =
      view === "awaiting" ? stats.awaitingCount
        : view === "cleared" ? stats.clearedCount
          : stats.awaitingCount + stats.clearedCount
    return NextResponse.json({
      handoffs,
      ...stats,
      page,
      limit,
      total: viewTotal,
      truncated: viewTotal > skip + handoffs.length,
    })
  } catch (err) {
    return apiInternalError("billing.list.get", err)
  }
}
