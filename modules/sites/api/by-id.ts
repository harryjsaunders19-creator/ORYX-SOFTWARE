import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"

const updateBodySchema = z.object({
  name: z.string().min(1).optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  siteReference: z.string().nullable().optional(),
  primaryContactId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

/** GET /api/sites/[id] */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await ctx.params
    const site = await siteService.getSummary(id)
    if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 })
    const jobs = await siteService.jobsForSite(id, 50)
    const audit = await siteService.listAudit(id, 30)
    return NextResponse.json({ site, jobs, audit })
  } catch (err) {
    return apiInternalError("sites.byId", err)
  }
}

/** PATCH /api/sites/[id] */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await ctx.params
    const parsed = updateBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 422 })
    }
    const updated = await siteService.update(
      id,
      parsed.data,
      { id: auth.user.id, name: actorName(auth.user) },
    )
    if (!updated) return NextResponse.json({ error: "Site not found" }, { status: 404 })
    const summary = await siteService.getSummary(id)
    return NextResponse.json(summary ?? updated)
  } catch (err) {
    return apiInternalError("sites.update", err)
  }
}

/** DELETE /api/sites/[id] — hard-delete only when zero jobs; otherwise 409 suggesting archive */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await ctx.params
    const result = await siteService.delete(id)
    if (!result.ok) {
      return NextResponse.json({
        error: result.error,
        jobCount: result.jobCount,
        suggestArchive: true,
      }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return apiInternalError("sites.delete", err)
  }
}
