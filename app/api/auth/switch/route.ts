/**
 * POST /api/auth/switch
 *
 * Admin impersonation only. Requires an existing authenticated session
 * (via POST /api/auth/login). Cold-start identity selection without a
 * password is not allowed — use the login page instead.
 *
 * Body: { userId: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { withoutPassword } from "@/modules/users/types/user-types"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { userService } from "@/lib/services/user-service"
import { SESSION_COOKIE, getRealUser } from "@/lib/auth"
import { setSessionCookies } from "@/lib/auth-cookies"
import { verifySessionToken } from "@/lib/session-cookie"
import { logError } from "@/shared/logger"

async function softAuditLog(
  entry: Parameters<typeof identitySwitchLogService.log>[0],
): Promise<void> {
  try {
    await identitySwitchLogService.log(entry)
  } catch (err) {
    logError("auth.switch.audit", err, {
      action: entry.action,
      realUserId: entry.realUserId,
    })
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 422 })

    const target = await userService.findUnique(userId)
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (!target.active) return NextResponse.json({ error: "This user has been disabled" }, { status: 403 })

    const realUser = await getRealUser()

    if (!realUser) {
      return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    }

    if (realUser.id === target.id) {
      // Re-selecting your own real identity. Only worth logging as
      // "impersonation ended" if an impersonation was actually in
      // progress (the active cookie currently differs from the real
      // one) — otherwise this is just clicking your own name again,
      // which isn't an event worth recording.
      const store = req.cookies
      const currentActiveId = await verifySessionToken(store.get(SESSION_COOKIE)?.value)
      if (currentActiveId && currentActiveId !== realUser.id) {
        await softAuditLog({ action: "IMPERSONATION_ENDED", realUserId: realUser.id, realUserName: realUser.name, targetUserId: target.id, targetUserName: target.name, detail: "Returned to own identity via switch" })
      }
      const res = NextResponse.json({ user: withoutPassword(target), isImpersonating: false })
      await setSessionCookies(res, target.id, realUser.id, {
        mustChangePassword: target.mustChangePassword === 1,
      })
      return res
    }

    // Switching to a genuinely different identity while already signed in
    // as someone else — this is impersonation. Authorized strictly by the
    // REAL identity's role, never the currently-active one, so an admin
    // impersonating a non-admin can't use that session to impersonate a
    // third identity; only logging out and back in as the real admin can.
    if (realUser.role !== "ADMIN") {
      await softAuditLog({ action: "IMPERSONATION_REJECTED", realUserId: realUser.id, realUserName: realUser.name, targetUserId: target.id, targetUserName: target.name })
      return NextResponse.json({ error: "Only administrators can switch to another account. Log out and sign back in as yourself if you need a different identity." }, { status: 403 })
    }

    await softAuditLog({ action: "IMPERSONATION_STARTED", realUserId: realUser.id, realUserName: realUser.name, targetUserId: target.id, targetUserName: target.name })
    const res = NextResponse.json({
      user: withoutPassword(target),
      isImpersonating: true,
      realUser: { id: realUser.id, name: realUser.name },
    })
    await setSessionCookies(res, target.id, realUser.id)
    return res
  } catch (err) {
    return apiInternalError("app.auth.switch.route", err)
  }
}
