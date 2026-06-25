import { NextRequest, NextResponse } from "next/server"
import { clientDb, holdDb } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    const q      = req.nextUrl.searchParams.get("q") ?? ""
    const limit  = parseInt(req.nextUrl.searchParams.get("limit") ?? "10")
    const clients = clientDb.search(q, Math.min(limit, 20))
    // Annotate each result with hold status — one batched lookup, not one query per result.
    const holdReasons = holdDb.activeHoldReasonsFor(clients.map(c => c.id))
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
