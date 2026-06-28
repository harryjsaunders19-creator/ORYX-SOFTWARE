/**
 * POST /api/auth/login
 *
 * Validates email + password against bcrypt-hashed passwords stored in the
 * user directory. Sets session cookies on success.
 */
import { NextRequest, NextResponse } from "next/server"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { userService } from "@/lib/services/user-service"
import { verifyPassword } from "@/lib/password"
import { checkLoginRateLimit } from "@/lib/login-rate-limit"
import { setSessionCookies } from "@/lib/auth-cookies"

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

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
    if (!checkLoginRateLimit(`${clientIp}:${email}`)) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 15 minutes and try again." },
        { status: 429 },
      )
    }

    const user = await userService.findByEmail(email)
    if (!user || !user.active) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "No password set for this account. Contact your administrator." }, { status: 401 })
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    await identitySwitchLogService.log({
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

    await setSessionCookies(res, user.id, user.id)

    return res
  } catch (err) {
    console.error("[POST /api/auth/login]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
