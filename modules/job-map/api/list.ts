import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

/** Read-only — never geocodes. */
export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const data = await jobMapService.getMapData()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    })
  } catch (err) {
    console.error("[GET /api/job-map]", err)
    return NextResponse.json({ error: "Failed to load job map" }, { status: 500 })
  }
}
