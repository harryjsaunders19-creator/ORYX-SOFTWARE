import { NextResponse } from "next/server"
import { getRealUser } from "@/lib/auth"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { clearSessionCookies } from "@/lib/auth-cookies"
import { logError } from "@/shared/logger"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  // Always clear cookies first so a logging failure cannot trap the session.
  clearSessionCookies(res)

  try {
    const realUser = await getRealUser()
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
