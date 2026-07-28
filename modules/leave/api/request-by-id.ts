import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireModuleAccess } from "@/shared/auth/auth"
import { canAcceptLeave } from "../permissions"
import { leaveService } from "../services/leave-service"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const action = typeof body.action === "string" ? body.action : ""

    if (action === "approve" || action === "reject") {
      if (!canAcceptLeave(auth.user)) {
        return NextResponse.json({ error: "Only admins can accept or decline leave" }, { status: 403 })
      }
      const updated = await leaveService.reviewRequest(
        auth.user,
        id,
        action === "approve" ? "APPROVED" : "REJECTED",
      )
      if (!updated) {
        return NextResponse.json({ error: "Cannot review this request" }, { status: 403 })
      }
      return NextResponse.json(updated)
    }

    if (action === "cancel") {
      const ok = await leaveService.cancelRequest(auth.user, id)
      if (!ok) return NextResponse.json({ error: "Cannot cancel this request" }, { status: 403 })
      return NextResponse.json({ ok: true })
    }

    if (body.startDate || body.endDate || body.reason !== undefined) {
      try {
        const updated = await leaveService.updateRequest(auth.user, id, {
          startDate: typeof body.startDate === "string" ? body.startDate : undefined,
          endDate: typeof body.endDate === "string" ? body.endDate : undefined,
          reason: typeof body.reason === "string" ? body.reason : body.reason === null ? null : undefined,
        })
        if (!updated) return NextResponse.json({ error: "Cannot update this request" }, { status: 403 })
        return NextResponse.json(updated)
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid request"
        return NextResponse.json({ error: msg }, { status: 422 })
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 422 })
  } catch (err) {
    return apiInternalError("leave.api.request-by-id", err)
  }
}
