import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/shared/auth/auth"
import { jobMapService } from "../services/job-map-service"

type Ctx = { params: Promise<{ id: string }> }

/** Admin — save manually placed pin coordinates. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let body: { latitude?: number; longitude?: number }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const latitude = Number(body.latitude)
    const longitude = Number(body.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "Valid latitude and longitude are required" }, { status: 422 })
    }

    const ok = await jobMapService.saveManualLocation(id, latitude, longitude)
    if (!ok) {
      return NextResponse.json({ error: "Coordinates must be within UK & Ireland" }, { status: 422 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return apiInternalError("job-map.api.location", err)
  }
}
