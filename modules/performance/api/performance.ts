import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import {
  buildPerformancePayload,
  resolvePerformancePeriod,
} from "../services/performance-service"

export async function GET(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const sp = req.nextUrl.searchParams
    const period = resolvePerformancePeriod(sp.get("from"), sp.get("to"))
    const payload = await buildPerformancePayload(period)
    return NextResponse.json(payload)
  } catch (err) {
    return apiInternalError("performance.get", err)
  }
}
