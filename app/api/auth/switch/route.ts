/**
 * POST /api/auth/switch
 *
 * Still no password check for the *first* identity pick in a browser
 * session — there's no credential to verify it against, and that's a real,
 * documented limitation (see PROJECT_OVERVIEW.md §27), not something this
 * route can fix on its own. What this route does enforce: once a real
 * identity exists for this session, switching to a *different* one is
 * impersonation, and impersonation is restricted to admins, checked against
 * the real underlying identity (never the currently-acted-as one), and
 * logged permanently regardless of whether it's allowed or rejected.
 *
 * Body: { userId: string }
 */
import { NextRequest, NextResponse } from "next/server"
import { userDb, identitySwitchLogDb } from "@/lib/db"
import { SESSION_COOKIE, REAL_SESSION_COOKIE, getRealUser } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 422 })

    const target = userDb.findUnique(userId)
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (!target.active) return NextResponse.json({ error: "This user has been disabled" }, { status: 403 })

    const realUser = await getRealUser()

    if (!realUser) {
      // Cold start — nobody has picked an identity for this browser session
      // yet. Nothing to authorize against; this becomes the real identity.
      identitySwitchLogDb.log({ action: "SESSION_STARTED", realUserId: target.id, realUserName: target.name, targetUserId: target.id, targetUserName: target.name })
      const res = NextResponse.json({ user: target, isImpersonating: false })
      setSessionCookies(res, target.id, target.id)
      return res
    }

    if (realUser.id === target.id) {
      // Re-selecting your own real identity. Only worth logging as
      // "impersonation ended" if an impersonation was actually in
      // progress (the active cookie currently differs from the real
      // one) — otherwise this is just clicking your own name again,
      // which isn't an event worth recording.
      const store = req.cookies
      const currentActiveId = store.get(SESSION_COOKIE)?.value
      if (currentActiveId && currentActiveId !== realUser.id) {
        identitySwitchLogDb.log({ action: "IMPERSONATION_ENDED", realUserId: realUser.id, realUserName: realUser.name, targetUserId: target.id, targetUserName: target.name, detail: "Returned to own identity via switch" })
      }
      const res = NextResponse.json({ user: target, isImpersonating: false })
      setSessionCookies(res, target.id, realUser.id)
      return res
    }

    // Switching to a genuinely different identity while already signed in
    // as someone else — this is impersonation. Authorized strictly by the
    // REAL identity's role, never the currently-active one, so an admin
    // impersonating a non-admin can't use that session to impersonate a
    // third identity; only logging out and back in as the real admin can.
    if (realUser.role !== "ADMIN") {
      identitySwitchLogDb.log({ action: "IMPERSONATION_REJECTED", realUserId: realUser.id, realUserName: realUser.name, targetUserId: target.id, targetUserName: target.name })
      return NextResponse.json({ error: "Only administrators can switch to another account. Log out and sign back in as yourself if you need a different identity." }, { status: 403 })
    }

    identitySwitchLogDb.log({ action: "IMPERSONATION_STARTED", realUserId: realUser.id, realUserName: realUser.name, targetUserId: target.id, targetUserName: target.name })
    const res = NextResponse.json({ user: target, isImpersonating: true, realUser: { id: realUser.id, name: realUser.name } })
    setSessionCookies(res, target.id, realUser.id)
    return res
  } catch (err) {
    console.error("[POST /api/auth/switch]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

function setSessionCookies(res: NextResponse, activeUserId: string, realUserId: string) {
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.COOKIE_SECURE === "true" }
  res.cookies.set(SESSION_COOKIE, activeUserId, opts)
  res.cookies.set(REAL_SESSION_COOKIE, realUserId, opts)
}
