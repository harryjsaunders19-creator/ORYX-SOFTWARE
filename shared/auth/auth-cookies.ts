import type { NextResponse } from "next/server"
import { SESSION_COOKIE, REAL_SESSION_COOKIE } from "@/shared/auth/session-cookie"
import { createSessionToken, sessionCookieOptions } from "@/shared/auth/session-cookie"

/** Set signed session cookies after login, switch, or exit-impersonation. */
export async function setSessionCookies(
  res: NextResponse,
  activeUserId: string,
  realUserId: string,
): Promise<void> {
  const opts = sessionCookieOptions()
  res.cookies.set(SESSION_COOKIE, await createSessionToken(activeUserId), opts)
  res.cookies.set(REAL_SESSION_COOKIE, await createSessionToken(realUserId), opts)
}

export function clearSessionCookies(res: NextResponse): void {
  const opts = { path: "/", maxAge: 0 }
  res.cookies.set(SESSION_COOKIE, "", opts)
  res.cookies.set(REAL_SESSION_COOKIE, "", opts)
}
