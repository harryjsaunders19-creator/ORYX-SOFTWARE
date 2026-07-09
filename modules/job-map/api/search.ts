import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const q = req.nextUrl.searchParams.get("q") ?? ""
    const results = await jobMapService.searchLocations(q)
    return NextResponse.json({ results })
  } catch (err) {
    console.error("[GET /api/job-map/search]", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
