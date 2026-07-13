import type { NextResponse } from "next/server"
import {
  SESSION_COOKIE,
  REAL_SESSION_COOKIE,
  MUST_CHANGE_PASSWORD_COOKIE,
} from "@/shared/auth/session-cookie"
import {
  createSessionToken,
  createMustChangeFlagToken,
  sessionCookieOptions,
} from "@/shared/auth/session-cookie"

export type SessionCookieOptions = {
  mustChangePassword?: boolean
}

/** Set signed session cookies after login, switch, or exit-impersonation. */
export async function setSessionCookies(
  res: NextResponse,
  activeUserId: string,
  realUserId: string,
  options?: SessionCookieOptions,
): Promise<void> {
  const opts = sessionCookieOptions()
  res.cookies.set(SESSION_COOKIE, await createSessionToken(activeUserId), opts)
  res.cookies.set(REAL_SESSION_COOKIE, await createSessionToken(realUserId), opts)

  if (options?.mustChangePassword) {
    res.cookies.set(MUST_CHANGE_PASSWORD_COOKIE, await createMustChangeFlagToken(), opts)
  } else {
    res.cookies.set(MUST_CHANGE_PASSWORD_COOKIE, "", { ...opts, maxAge: 0 })
  }
}

export function clearSessionCookies(res: NextResponse): void {
  // Must match Secure/SameSite/path used when setting, or browsers keep the cookie.
  const opts = { ...sessionCookieOptions(), maxAge: 0 }
  res.cookies.set(SESSION_COOKIE, "", opts)
  res.cookies.set(REAL_SESSION_COOKIE, "", opts)
  res.cookies.set(MUST_CHANGE_PASSWORD_COOKIE, "", opts)
}
