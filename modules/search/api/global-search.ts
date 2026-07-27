import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { parseLimitParam } from "@/shared/utils/pagination"
import { runGlobalSearch } from "@/modules/search/services/global-search-service"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
    const limit = parseLimitParam(req.nextUrl.searchParams.get("limit"), 24, 30)

    if (q.length > 0 && q.length < 2) {
      return NextResponse.json({
        query: q,
        groups: [],
        total: 0,
        tookMs: 0,
        hint: "Type at least 2 characters",
      })
    }

    const result = await runGlobalSearch({
      query: q,
      role: auth.user.role,
      limit,
    })
    return NextResponse.json(result)
  } catch (err) {
    return apiInternalError("search.api.global", err)
  }
}
