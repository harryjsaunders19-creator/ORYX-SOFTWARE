import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { requireSignIn } from "@/shared/auth/auth"
import { leaveService } from "../services/leave-service"

/** Approved leave in a date range — used for calendar sync and reporting. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const from = sp.get("from")
    const to = sp.get("to")
    if (!from || !to) {
      return NextResponse.json({ error: "from and to date parameters are required" }, { status: 422 })
    }

    const all = await leaveService.findApprovedInRange(from, to)
    const requests = auth.user.role === "ADMIN"
      ? all
      : await leaveService.findMany(auth.user, { status: "APPROVED", from, to })

    return listResponse({ requests })
  } catch (err) {
    console.error("[GET /api/leave/approved]", err)
    return NextResponse.json({ error: "Failed to load approved leave" }, { status: 500 })
  }
}
