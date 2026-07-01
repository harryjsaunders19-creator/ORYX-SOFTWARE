import { NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { requireSignIn } from "@/shared/auth/auth"
import { listResponse } from "@/shared/utils/api-cache"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    return listResponse({ designers: jobService.distinctDesigners() })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
