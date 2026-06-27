import { NextResponse } from "next/server"
import { holdService } from "@/lib/services/hold-service"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    const holds = await holdService.allActive()
    return NextResponse.json({ holds, total: holds.length })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
