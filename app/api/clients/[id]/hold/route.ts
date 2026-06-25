import { NextRequest, NextResponse } from "next/server"
import { holdDb, clientDb } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

/** GET: current hold status for a client */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    if (!clientDb.findUnique(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const hold    = holdDb.activeHoldForClient(id)
    const history = holdDb.historyForClient(id)
    return NextResponse.json({ hold, history })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** POST: put client on hold */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const { id } = await params
    if (!clientDb.findUnique(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const reason  = typeof body.reason  === "string" ? body.reason.trim()  : ""
    const addedBy = typeof body.addedBy === "string" ? body.addedBy.trim() : "System"
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 422 })
    const hold = holdDb.addHold({
      clientId: id, reason, addedBy,
      notes: body.notes ? String(body.notes).trim() : null,
    })
    return NextResponse.json(hold, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** DELETE: remove client from hold */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const { id } = await params
    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* body optional */ }
    const removedBy     = typeof body.removedBy     === "string" ? body.removedBy.trim()     : "System"
    const removedReason = typeof body.removedReason === "string" ? body.removedReason.trim() : null
    const hold = holdDb.removeHold({ clientId: id, removedBy, removedReason })
    if (!hold) return NextResponse.json({ error: "Client is not currently on hold" }, { status: 404 })
    return NextResponse.json(hold)
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
