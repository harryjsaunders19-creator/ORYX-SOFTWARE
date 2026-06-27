import { NextRequest, NextResponse } from "next/server"
import { holdService } from "@/lib/services/hold-service"
import { clientService } from "@/lib/services/client-service"
import { getCurrentUser } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    const q      = req.nextUrl.searchParams.get("q") ?? ""
    const limit  = parseInt(req.nextUrl.searchParams.get("limit") ?? "10")
    const clients = await clientService.search(q, Math.min(limit, 20))
    // Annotate each result with hold status — one batched lookup, not one query per result.
    const holdReasons = await holdService.activeHoldReasonsFor(clients.map(c => c.id))
    const reasonByClientId = new Map(holdReasons.map(h => [h.clientId, h.reason]))
    const clientsWithHold = clients.map(c => ({
      ...c,
      onHold:     reasonByClientId.has(c.id),
      holdReason: reasonByClientId.get(c.id) ?? null,
    }))
    return NextResponse.json({ clients: clientsWithHold })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
