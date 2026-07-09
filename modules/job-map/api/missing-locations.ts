import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const jobs = await jobMapService.getMissingLocations()
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error("[GET /api/job-map/missing-locations]", err)
    return NextResponse.json({ error: "Failed to load missing locations" }, { status: 500 })
  }
}
