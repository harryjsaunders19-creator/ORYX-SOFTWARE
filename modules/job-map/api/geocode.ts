import { NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { jobMapService, GEOCODE_BATCH_SIZE } from "../services/job-map-service"

/** Admin — batch geocode completed jobs missing coordinates. */
export async function POST() {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import("@/shared/auth/rate-limit")
    if (!(await checkRateLimit(`geocode:${auth.user.id}`, RATE_PRESETS.geocode))) {
      return rateLimitedResponse(3600)
    }

    const result = await jobMapService.geocodeBatch(GEOCODE_BATCH_SIZE)
    return NextResponse.json(result)
  } catch (err) {
    return apiInternalError("job-map.api.geocode", err)
  }
}
