/**
 * POST /api/auth/login
 *
 * Validates email + password against bcrypt-hashed passwords stored in the
 * User table. Sets session cookies on success. Returns `mustChangePassword`
 * so the client can redirect to /set-password when needed.
 */
import { NextRequest, NextResponse } from "next/server"
import { userDb, identitySwitchLogDb } from "@/lib/db"
import { SESSION_COOKIE, REAL_SESSION_COOKIE } from "@/lib/auth"
import { verifyPassword } from "@/lib/password"

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string; password?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const email    = typeof body.email    === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 422 })
    }

    const user = userDb.findByEmail(email)
    if (!user || !user.active) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "No password set for this account. Contact your administrator." }, { status: 401 })
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    identitySwitchLogDb.log({
      action: "SESSION_STARTED",
      realUserId: user.id,
      realUserName: user.name,
      targetUserId: user.id,
      targetUserName: user.name,
      detail: "Login via email/password",
    })

    const res = NextResponse.json({
      user: {
        id: user.id, name: user.name, email: user.email,
        role: user.role, active: user.active,
      },
      mustChangePassword: user.mustChangePassword === 1,
      isImpersonating: false,
      realUser: null,
    })

    const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 30, secure: process.env.COOKIE_SECURE === "true" }
    res.cookies.set(SESSION_COOKIE, user.id, opts)
    res.cookies.set(REAL_SESSION_COOKIE, user.id, opts)

    return res
  } catch (err) {
    console.error("[POST /api/auth/login]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
