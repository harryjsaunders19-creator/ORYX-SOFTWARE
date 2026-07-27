/**
 * POST /api/auth/exit-impersonation
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { SESSION_COOKIE, REAL_SESSION_COOKIE, getRealUser } from "@/lib/auth"
import { setSessionCookies } from "@/lib/auth-cookies"
import { verifySessionToken, verifySessionTokenDetailed } from "@/lib/session-cookie"
import { sessionRevocationService } from "@/lib/services/session-revocation-service"
import { withoutPassword } from "@/modules/users/types/user-types"
import { logError } from "@/shared/logger"

export async function POST(req: NextRequest) {
  try {
    const activeToken = req.cookies.get(SESSION_COOKIE)?.value
    const realToken = req.cookies.get(REAL_SESSION_COOKIE)?.value

    const realUser = await getRealUser()
    if (!realUser) {
      return NextResponse.json({ error: "No active session" }, { status: 401 })
    }

    const currentActiveId = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)
    if (currentActiveId && currentActiveId !== realUser.id) {
      try {
        await identitySwitchLogService.log({
          action: "IMPERSONATION_ENDED",
          realUserId: realUser.id, realUserName: realUser.name,
          targetUserId: realUser.id, targetUserName: realUser.name,
          detail: `Exited impersonation (was acting as user ${currentActiveId})`,
        })
      } catch (err) {
        logError("auth.exit-impersonation.audit", err, { realUserId: realUser.id })
      }
    }

    const res = NextResponse.json({ user: withoutPassword(realUser), isImpersonating: false })

    // M3: revoke the currently-present session cookies immediately so a stolen
    // token can no longer authenticate after impersonation ends.
    const [activeDetailed, realDetailed] = await Promise.all([
      verifySessionTokenDetailed(activeToken),
      verifySessionTokenDetailed(realToken),
    ])
    await Promise.all([
      activeDetailed
        ? sessionRevocationService.revokeToken(
            activeDetailed.tokenSig,
            new Date(activeDetailed.expUnixSec * 1000).toISOString(),
          )
        : Promise.resolve(),
      realDetailed
        ? sessionRevocationService.revokeToken(
            realDetailed.tokenSig,
            new Date(realDetailed.expUnixSec * 1000).toISOString(),
          )
        : Promise.resolve(),
    ])

    await setSessionCookies(res, realUser.id, realUser.id)
    return res
  } catch (err) {
    return apiInternalError("app.auth.exit-impersonation.route", err)
  }
}
