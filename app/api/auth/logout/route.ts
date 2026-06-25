import { NextResponse } from "next/server"
import { SESSION_COOKIE, REAL_SESSION_COOKIE, getRealUser } from "@/lib/auth"
import { identitySwitchLogDb } from "@/lib/db"

export async function POST() {
  const realUser = await getRealUser()
  if (realUser) {
    identitySwitchLogDb.log({ action: "LOGOUT", realUserId: realUser.id, realUserName: realUser.name })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(SESSION_COOKIE)
  res.cookies.delete(REAL_SESSION_COOKIE)
  return res
}
