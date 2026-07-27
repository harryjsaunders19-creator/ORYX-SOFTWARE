/**
 * POST /api/auth/set-password
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { SESSION_COOKIE, REAL_SESSION_COOKIE, getCurrentUser, getRealUser } from "@/lib/auth"
import { setSessionCookies } from "@/lib/auth-cookies"
import { verifySessionTokenDetailed } from "@/lib/session-cookie"
import { sessionRevocationService } from "@/lib/services/session-revocation-service"
import { userService } from "@/lib/services/user-service"
import { hashPassword, validatePasswordStrength } from "@/lib/password"

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const realUser = await getRealUser()
    if (!realUser || realUser.id !== user.id) {
      return NextResponse.json(
        { error: "Cannot change password while impersonating" },
        { status: 403 },
      )
    }
    let body: { password?: string; confirmPassword?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const password        = typeof body.password        === "string" ? body.password        : ""
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : ""

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 422 })
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 422 })
    }

    const strengthError = validatePasswordStrength(password)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 422 })
    }

    await userService.update(user.id, {
      passwordHash: hashPassword(password),
      mustChangePassword: 0,
    })

    // M3: revoke old cookie signatures immediately before rotating to new cookies.
    const activeToken = req.cookies.get(SESSION_COOKIE)?.value
    const realToken = req.cookies.get(REAL_SESSION_COOKIE)?.value
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

    const res = NextResponse.json({ ok: true })
    await setSessionCookies(res, user.id, user.id)
    return res
  } catch (err) {
    return apiInternalError("app.auth.set-password.route", err)
  }
}
