import { NextResponse } from "next/server"
import { getRealUser } from "@/lib/auth"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { clearSessionCookies } from "@/lib/auth-cookies"

export async function POST() {
  const realUser = await getRealUser()
  if (realUser) {
    await identitySwitchLogService.log({ action: "LOGOUT", realUserId: realUser.id, realUserName: realUser.name })
  }
  const res = NextResponse.json({ ok: true })
  clearSessionCookies(res)
  return res
}
