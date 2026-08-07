import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

type Ctx = { params: Promise<{ id: string }> }

/** Admin — retry geocoding a single job. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireFullAccess()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const result = await jobMapService.retryGeocode(id)
    return NextResponse.json(result)
  } catch (err) {
    return apiInternalError("job-map.api.retry-location", err)
  }
}
