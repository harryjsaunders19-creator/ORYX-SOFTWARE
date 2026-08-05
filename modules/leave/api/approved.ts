import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { listResponse } from "@/shared/utils/api-cache"
import { requireModuleAccess } from "@/shared/auth/auth"
import { leaveService } from "../services/leave-service"
import { hasFullAccess } from "@/shared/auth/permissions"

/** Approved leave in a date range — used for calendar sync and reporting. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    if (!from || !to) {
      return NextResponse.json({ error: "from and to date parameters are required" }, { status: 422 })
    }

    const all = await leaveService.findApprovedInRange(from, to)
    const requests = hasFullAccess(auth.user.role)
      ? all
      : await leaveService.findMany(auth.user, { status: "APPROVED", from, to })

    return listResponse({ requests })
  } catch (err) {
    return apiInternalError("leave.api.approved", err)
  }
}
