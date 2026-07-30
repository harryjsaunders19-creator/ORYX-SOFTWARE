import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"

/** POST /api/sites/[id]/restore */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await ctx.params
    const site = await siteService.restore(id, {
      id: auth.user.id,
      name: actorName(auth.user),
    })
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 })
    return NextResponse.json(site)
  } catch (err) {
    return apiInternalError("sites.restore", err)
  }
}
