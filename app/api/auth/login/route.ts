/**
 * POST /api/auth/login
 *
 * Validates email + password against bcrypt-hashed passwords stored in the
 * user directory. Sets session cookies on success.
 */
import { NextRequest, NextResponse } from "next/server"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { userService } from "@/lib/services/user-service"
import { supabaseUserRepo } from "@/lib/supabase/repositories/users"
import { useSupabaseUsers } from "@/lib/supabase/feature-flags"
import { verifyPassword } from "@/lib/password"
import { checkLoginRateLimit } from "@/lib/login-rate-limit"
import { setSessionCookies } from "@/lib/auth-cookies"
import { apiInternalError } from "@/shared/api-errors"
import { logError } from "@/shared/logger"

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

    // When Supabase is the primary user store, ensure this user exists there
    // before issuing a session cookie. On Vercel every request may land on a
    // fresh serverless container with an empty /tmp SQLite, so the session
    // must be resolvable via Supabase on subsequent requests.
    if (useSupabaseUsers()) {
      try {
        await supabaseUserRepo.upsert(user)
      } catch (err) {
        logError("auth.login.supabase_sync", err, { userId: user.id })
        return NextResponse.json(
          { error: "Database sync error. Check SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL environment variables, and ensure migration 008_users.sql has been run in Supabase." },
          { status: 503 },
        )
      }
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

    await setSessionCookies(res, user.id, user.id, {
      mustChangePassword: user.mustChangePassword === 1,
    })

    return res
  } catch (err) {
    return apiInternalError("auth.login", err)
  }
}
