import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { requireModuleAccess } from "@/shared/auth/auth"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"
import { apiInternalError } from "@/shared/api-errors"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"
import { VALID_STATUSES } from "@/lib/constants"
import { mixedWorkloadService } from "@/modules/jobs/services/mixed-workload-service"

function modelDisabled() {
  return NextResponse.json(
    { error: "Work items model is not enabled. Set WORK_ITEMS_MODEL=true." },
    { status: 503 },
  )
}

/**
 * GET — active design work items + standalone non-design jobs (site visits, etc.).
 */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth
  if (!isWorkItemsModelEnabled()) return modelDisabled()

  try {
    const sp = req.nextUrl.searchParams
    const page = parsePageParam(sp.get("page"))
    const limit = parseLimitParam(sp.get("limit"), 25, 100)
    const search = sp.get("search") ?? undefined
    const status = sp.get("status") ?? undefined
    const designer = sp.get("designer") ?? undefined
    const unassigned = sp.get("unassigned") === "true"

    if (status && !VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const { rows, total } = await mixedWorkloadService.findActive({
      search,
      status,
      designer,
      unassigned: unassigned || undefined,
      skip: (page - 1) * limit,
      take: limit,
    })

    return listResponse({
      workItems: rows,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) {
    return apiInternalError("work-items.list", err)
  }
}
