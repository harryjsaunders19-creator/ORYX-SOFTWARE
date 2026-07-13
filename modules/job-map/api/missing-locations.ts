import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const jobs = await jobMapService.getMissingLocations()
    return NextResponse.json({ jobs })
  } catch (err) {
    return apiInternalError("job-map.api.missing-locations", err)
  }
}
