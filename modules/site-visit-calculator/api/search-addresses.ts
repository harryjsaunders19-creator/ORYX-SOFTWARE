import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { searchLocations } from "@/modules/job-map/services/geocode-service"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { checkRateLimit, rateLimitedResponse } = await import("@/shared/auth/rate-limit")
    if (!(await checkRateLimit(`svc-calc-search:${auth.user.id}`, { windowMs: 60 * 1000, maxAttempts: 240 }))) {
      return rateLimitedResponse(60)
    }

    const q = req.nextUrl.searchParams.get("q") ?? ""
    const results = await searchLocations(q)
    return NextResponse.json({ results })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.search-addresses", err)
  }
}
