import { NextResponse } from "next/server"
import { jobService } from "@/lib/services/job-service"
import { requireSignIn } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    return NextResponse.json({ designers: jobService.distinctDesigners() })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
