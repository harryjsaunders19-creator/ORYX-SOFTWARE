import { NextResponse } from "next/server"
import { requireRole } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

type Ctx = { params: Promise<{ id: string }> }

/** Admin — retry geocoding a single job. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const result = await jobMapService.retryGeocode(id)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/job-map/locations/[id]/retry]", err)
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 })
  }
}
