import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { listResponse } from "@/shared/utils/api-cache"
import { requireModuleAccess } from "@/shared/auth/auth"
import { leaveService } from "../services/leave-service"
import type { LeaveRequestStatus } from "../constants"
import { LEAVE_REQUEST_STATUSES } from "../constants"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const statusParam = sp.get("status")
    const status = statusParam && LEAVE_REQUEST_STATUSES.includes(statusParam as LeaveRequestStatus)
      ? statusParam as LeaveRequestStatus
      : undefined

    const requests = await leaveService.findMany(auth.user, {
      userId: sp.get("userId") ?? undefined,
      status,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    })

    return listResponse({ requests })
  } catch (err) {
    return apiInternalError("leave.api.requests", err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const startDate = typeof body.startDate === "string" ? body.startDate : ""
    const endDate = typeof body.endDate === "string" ? body.endDate : ""
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Start and end dates are required" }, { status: 422 })
    }

    try {
      const created = await leaveService.createRequest(auth.user, {
        userId: typeof body.userId === "string" ? body.userId : undefined,
        leaveType: typeof body.leaveType === "string" ? body.leaveType as "ANNUAL_LEAVE" | "SICK_LEAVE" | "OTHER" : undefined,
        startDate,
        endDate,
        reason: typeof body.reason === "string" ? body.reason : null,
      })

      if (!created) {
        return NextResponse.json({ error: "Not allowed to create leave for this employee" }, { status: 403 })
      }

      return NextResponse.json(created, { status: 201 })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid request"
      return NextResponse.json({ error: msg }, { status: 422 })
    }
  } catch (err) {
    return apiInternalError("leave.api.requests", err)
  }
}
