import { NextRequest, NextResponse } from "next/server"
import { holdService } from "../services/hold-service"
import { clientService } from "../../services/client-service"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"

type Ctx = { params: Promise<{ id: string }> }

/** GET: current hold status for a client */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await clientService.findUnique(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const hold    = await holdService.activeHoldForClient(id)
    const history = await holdService.historyForClient(id)
    return NextResponse.json({ hold, history })
  } catch (err) {
    return apiInternalError("clients.hold.by_client.get", err)
  }
}

/** POST: put client on hold */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await clientService.findUnique(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const reason = typeof body.reason === "string" ? body.reason.trim() : ""
    if (!reason) return NextResponse.json({ error: "Reason is required" }, { status: 422 })
    const hold = await holdService.addHold({
      clientId: id,
      reason,
      addedBy: actorName(auth.user),
      notes: body.notes ? String(body.notes).trim() : null,
    })
    return NextResponse.json(hold, { status: 201 })
  } catch (err) {
    return apiInternalError("clients.hold.by_client.create", err)
  }
}

/** DELETE: remove client from hold */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* body optional */ }
    const removedReason = typeof body.removedReason === "string" ? body.removedReason.trim() : null
    const hold = await holdService.removeHold({
      clientId: id,
      removedBy: actorName(auth.user),
      removedReason,
    })
    if (!hold) return NextResponse.json({ error: "Client is not currently on hold" }, { status: 404 })
    return NextResponse.json(hold)
  } catch (err) {
    return apiInternalError("clients.hold.by_client.delete", err, undefined, { exposeDetail: true })
  }
}
