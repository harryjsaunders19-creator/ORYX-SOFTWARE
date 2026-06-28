import { NextResponse } from "next/server"
import { holdService } from "@/lib/services/hold-service"
import { requireSignIn } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const holds = await holdService.allActive()
    return NextResponse.json({ holds, total: holds.length })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
