import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"

/** GET /api/sites/[id]/jobs */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await ctx.params
    const site = await siteService.findUnique(id)
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 })
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50, 200)
    const jobs = await siteService.jobsForSite(id, limit)
    const jobCounts = await siteService.jobCounts(id)
    return NextResponse.json({ jobs, jobCounts })
  } catch (err) {
    return apiInternalError("sites.jobs", err)
  }
}
