/**
 * POST /api/auth/exit-impersonation
 */
import { NextRequest, NextResponse } from "next/server"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { SESSION_COOKIE, REAL_SESSION_COOKIE, getRealUser } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const realUser = await getRealUser()
    if (!realUser) {
      return NextResponse.json({ error: "No active session" }, { status: 401 })
    }

    const currentActiveId = req.cookies.get(SESSION_COOKIE)?.value
    if (currentActiveId && currentActiveId !== realUser.id) {
      await identitySwitchLogService.log({
        action: "IMPERSONATION_ENDED",
        realUserId: realUser.id, realUserName: realUser.name,
        targetUserId: realUser.id, targetUserName: realUser.name,
        detail: `Exited impersonation (was acting as user ${currentActiveId})`,
      })
    }

    const res = NextResponse.json({ user: realUser, isImpersonating: false })
    const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30 }
    res.cookies.set(SESSION_COOKIE, realUser.id, opts)
    res.cookies.set(REAL_SESSION_COOKIE, realUser.id, opts)
    return res
  } catch (err) {
    console.error("[POST /api/auth/exit-impersonation]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
