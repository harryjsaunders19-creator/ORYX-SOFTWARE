import { NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { holdService } from "../services/hold-service"
import { requireSignIn } from "@/shared/auth/auth"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const holds = await holdService.allActive()
    return listResponse({ holds, total: holds.length })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
