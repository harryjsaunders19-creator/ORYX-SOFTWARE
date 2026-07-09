import { NextResponse } from "next/server"
import { requireRole } from "@/shared/auth/auth"
import { jobMapService, GEOCODE_BATCH_SIZE } from "../services/job-map-service"

/** Admin — batch geocode completed jobs missing coordinates. */
export async function POST() {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const result = await jobMapService.geocodeBatch(GEOCODE_BATCH_SIZE)
    return NextResponse.json(result)
  } catch (err) {
    console.error("[POST /api/job-map/geocode]", err)
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 })
  }
}
