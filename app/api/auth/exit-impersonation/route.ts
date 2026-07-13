/**
 * POST /api/auth/exit-impersonation
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { SESSION_COOKIE, getRealUser } from "@/lib/auth"
import { setSessionCookies } from "@/lib/auth-cookies"
import { verifySessionToken } from "@/lib/session-cookie"
import { withoutPassword } from "@/modules/users/types/user-types"

export async function POST(req: NextRequest) {
  try {
    const realUser = await getRealUser()
    if (!realUser) {
      return NextResponse.json({ error: "No active session" }, { status: 401 })
    }

    const currentActiveId = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
    if (currentActiveId && currentActiveId !== realUser.id) {
      await identitySwitchLogService.log({
        action: "IMPERSONATION_ENDED",
        realUserId: realUser.id, realUserName: realUser.name,
        targetUserId: realUser.id, targetUserName: realUser.name,
        detail: `Exited impersonation (was acting as user ${currentActiveId})`,
      })
    }

    const res = NextResponse.json({ user: withoutPassword(realUser), isImpersonating: false })
    await setSessionCookies(res, realUser.id, realUser.id)
    return res
  } catch (err) {
    return apiInternalError("app.auth.exit-impersonation.route", err)
  }
}
