import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"
import type { JobMapBbox } from "../types/job-map-types"

function parseBbox(req: NextRequest): JobMapBbox | undefined {
  const sp = req.nextUrl.searchParams
  const south = Number(sp.get("south"))
  const west = Number(sp.get("west"))
  const north = Number(sp.get("north"))
  const east = Number(sp.get("east"))
  if (![south, west, north, east].every(Number.isFinite)) return undefined
  if (south >= north || west >= east) return undefined
  return { south, west, north, east }
}

/** Read-only — never geocodes. Optional ?south&west&north&east for viewport loads. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth

    const bbox = parseBbox(req)
    const data = await jobMapService.getMapData(bbox ? { bbox } : {})
    return NextResponse.json(data, {
      headers: { "Cache-Control": bbox ? "private, no-store" : "private, max-age=60" },
    })
  } catch (err) {
    return apiInternalError("job-map.api.list", err)
  }
}
