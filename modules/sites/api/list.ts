import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"
import { clientService } from "@/modules/clients"
import { isMissingSitesSchemaError, SITES_MIGRATION_HINT } from "@/modules/sites/lib/schema-errors"

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

function sitesUnavailable(err: unknown) {
  if (!isMissingSitesSchemaError(err)) return null
  return NextResponse.json(
    {
      error: SITES_MIGRATION_HINT,
      detail: SITES_MIGRATION_HINT,
      code: "SITES_SCHEMA_MISSING",
    },
    { status: 503 },
  )
}

/** GET /api/sites?clientId= — list managed sites for a client */
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
    const unavailable = sitesUnavailable(err)
    if (unavailable) return unavailable
    return apiInternalError("sites.list", err)
  }
}

/** POST /api/sites — create a managed site under a client */
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
      try {
        const duplicates = await siteService.findLikelyDuplicates({
          clientId: body.clientId,
          name: body.name,
          addressLine1: body.addressLine1,
          postcode: body.postcode,
        })
        if (duplicates.length > 0) {
          return NextResponse.json({
            error: "Possible existing managed site",
            duplicates,
          }, { status: 409 })
        }
      } catch (err) {
        const unavailable = sitesUnavailable(err)
        if (unavailable) return unavailable
        throw err
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

    let summary = null
    try {
      summary = await siteService.getSummary(site.id)
    } catch {
      summary = null
    }
    return NextResponse.json(summary ?? site, { status: 201 })
  } catch (err) {
    const unavailable = sitesUnavailable(err)
    if (unavailable) return unavailable
    return apiInternalError("sites.create", err, undefined, { exposeDetail: true })
  }
}
