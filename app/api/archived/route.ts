import { NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { clientService } from "@/lib/services/client-service"
import { attachCancelRecords } from "@/lib/cancel-record"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const [jobs, quotes, clients] = await Promise.all([
      jobService.findArchived(),
      quoteService.findArchived(),
      clientService.findArchived(),
    ])

    return NextResponse.json({
      jobs: await attachCancelRecords(jobs),
      quotes,
      clients,
    })
  } catch (err) {
    console.error("[GET /api/archived]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
