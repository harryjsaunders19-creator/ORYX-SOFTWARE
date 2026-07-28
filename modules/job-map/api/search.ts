import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireModuleAccess } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("job-map")
    if (auth instanceof NextResponse) return auth

    const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import("@/shared/auth/rate-limit")
    if (!(await checkRateLimit(`map-search:${auth.user.id}`, RATE_PRESETS.mapSearch))) {
      return rateLimitedResponse(60)
    }

    const q = req.nextUrl.searchParams.get("q") ?? ""
    const results = await jobMapService.searchLocations(q)
    return NextResponse.json({ results })
  } catch (err) {
    return apiInternalError("job-map.api.search", err)
  }
}
