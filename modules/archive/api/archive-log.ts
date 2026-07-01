import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { archiveLogService } from "../services/archive-log-service"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const entries = await archiveLogService.findMany(500)
    return NextResponse.json(entries)
  } catch (err) {
    console.error("[GET /api/archive-log]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
