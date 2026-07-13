import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { buildSiteVisitPdfBuffer } from "../pdf/generate-summary"
import type { SiteVisitCalculationResult } from "../types"

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import("@/shared/auth/rate-limit")
    if (!(await checkRateLimit(`pdf:${auth.user.id}`, RATE_PRESETS.pdf))) {
      return rateLimitedResponse()
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const result = body.result as SiteVisitCalculationResult | undefined
    if (!result?.siteAddress || result.grandTotal == null) {
      return NextResponse.json({ error: "Calculation result is required" }, { status: 422 })
    }

    const pdf = await buildSiteVisitPdfBuffer(result)
    const filename = `site-visit-estimate-${new Date().toISOString().slice(0, 10)}.pdf`

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.pdf", err)
  }
}
