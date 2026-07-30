import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { siteService } from "@/modules/sites"
import { isMissingSitesSchemaError, SITES_MIGRATION_HINT } from "@/modules/sites/lib/schema-errors"

/** GET /api/sites/search?clientId=&q= */
export async function GET(req: NextRequest) {
  const auth = await requireModuleAccess("jobs")
  if (auth instanceof NextResponse) return auth

  try {
    const clientId = req.nextUrl.searchParams.get("clientId")
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 })
    }
    const q = req.nextUrl.searchParams.get("q") ?? ""
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true"
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 12) || 12, 50)
    const sites = await siteService.search({
      clientId,
      q,
      activeOnly: !includeArchived,
      includeArchived,
      limit,
    })
    return NextResponse.json({ sites })
  } catch (err) {
    if (isMissingSitesSchemaError(err)) {
      return NextResponse.json(
        { sites: [], error: SITES_MIGRATION_HINT, code: "SITES_SCHEMA_MISSING" },
        { status: 200 },
      )
    }
    return apiInternalError("sites.search", err)
  }
}
