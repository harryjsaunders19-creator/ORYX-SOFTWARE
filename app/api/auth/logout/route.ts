import { NextRequest, NextResponse } from "next/server"
import { SESSION_COOKIE, REAL_SESSION_COOKIE, getRealUser } from "@/lib/auth"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { clearSessionCookies } from "@/lib/auth-cookies"
import { verifySessionTokenDetailed } from "@/lib/session-cookie"
import { sessionRevocationService } from "@/lib/services/session-revocation-service"
import { logError } from "@/shared/logger"

export async function POST(req: NextRequest) {
  const activeToken = req.cookies.get(SESSION_COOKIE)?.value
  const realToken = req.cookies.get(REAL_SESSION_COOKIE)?.value

  const res = NextResponse.json({ ok: true })
  // Always clear cookies first so a logging failure cannot trap the session.
  clearSessionCookies(res)

  try {
    const realUser = await getRealUser()

    // M3: revoke the currently-present cookies immediately so a stolen token
    // can no longer authenticate after the user logs out.
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

    if (realUser) {
      await identitySwitchLogService.log({
        action: "LOGOUT",
        realUserId: realUser.id,
        realUserName: realUser.name,
      })
    }
  } catch (err) {
    logError("auth.logout.audit", err)
  }

  return res
}
