import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"
import { clientService } from "@/modules/clients"

const createBodySchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  siteReference: z.string().nullable().optional(),
  primaryContactId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createAnyway: z.boolean().optional(),
})

/** GET /api/sites?clientId= — list sites for a client */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const clientId = req.nextUrl.searchParams.get("clientId")
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 })
    }
    const search = req.nextUrl.searchParams.get("search") ?? undefined
    const activeOnly = req.nextUrl.searchParams.get("activeOnly") !== "false"
    const sites = await siteService.listForClient(clientId, { activeOnly, search })
    return NextResponse.json({ sites })
  } catch (err) {
    return apiInternalError("sites.list", err)
  }
}

/** POST /api/sites — create a site under a client */
export async function POST(req: NextRequest) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const parsed = createBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 422 })
    }
    const body = parsed.data
    const client = await clientService.findUnique(body.clientId)
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    if (!body.createAnyway) {
      const duplicates = await siteService.findLikelyDuplicates({
        clientId: body.clientId,
        name: body.name,
        addressLine1: body.addressLine1,
        postcode: body.postcode,
      })
      if (duplicates.length > 0) {
        return NextResponse.json({
          error: "Possible existing site",
          duplicates,
        }, { status: 409 })
      }
    }

    const site = await siteService.create(
      {
        clientId: body.clientId,
        name: body.name.trim(),
        addressLine1: body.addressLine1?.trim() || null,
        addressLine2: body.addressLine2?.trim() || null,
        city: body.city?.trim() || null,
        county: body.county?.trim() || null,
        postcode: body.postcode?.trim() || null,
        country: body.country?.trim() || "United Kingdom",
        siteReference: body.siteReference?.trim() || null,
        primaryContactId: body.primaryContactId || null,
        notes: body.notes?.trim() || null,
      },
      { id: auth.user.id, name: actorName(auth.user) },
    )

    const summary = await siteService.getSummary(site.id)
    return NextResponse.json(summary ?? site, { status: 201 })
  } catch (err) {
    return apiInternalError("sites.create", err)
  }
}
