import { NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { clientDb } from "@/lib/db/stores"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const [jobs, quotes] = await Promise.all([
      jobService.findArchived(),
      quoteService.findArchived(),
    ])

    // Clients use the existing active=0 mechanism; fetch all and filter
    const allClients = clientDb.findMany({ activeOnly: false })
    const clients = allClients.filter(c => c.active === 0)

    return NextResponse.json({ jobs, quotes, clients })
  } catch (err) {
    console.error("[GET /api/archived]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
