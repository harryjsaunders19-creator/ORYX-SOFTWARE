import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { requireSignIn } from "@/shared/auth/auth"
import type { Role } from "@/shared/auth/permissions"
import { apiInternalError } from "@/shared/api-errors"
import { buildDashboardStats } from "../services/build-dashboard-stats"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const payload = await buildDashboardStats({
      role: auth.user.role as Role,
      calendarFrom: sp.get("calendarFrom") ?? undefined,
      calendarTo: sp.get("calendarTo") ?? undefined,
    })
    return listResponse(payload)
  } catch (err) {
    return apiInternalError("dashboard.stats.get", err)
  }
}
