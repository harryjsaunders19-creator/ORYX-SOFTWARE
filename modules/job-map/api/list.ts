import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

/** Read-only — never geocodes. */
export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const data = await jobMapService.getMapData()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    })
  } catch (err) {
    return apiInternalError("job-map.api.list", err)
  }
}
