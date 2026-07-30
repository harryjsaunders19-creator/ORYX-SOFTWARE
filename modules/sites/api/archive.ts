import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"

/** POST /api/sites/[id]/archive */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await ctx.params
    const result = await siteService.archive(id, {
      id: auth.user.id,
      name: actorName(auth.user),
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }
    return NextResponse.json(result.site)
  } catch (err) {
    return apiInternalError("sites.archive", err)
  }
}
