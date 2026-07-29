/**
 * POST /api/auth/login
 *
 * Validates email + password against bcrypt-hashed passwords stored in the
 * user directory. Sets session cookies on success.
 */
import { NextRequest, NextResponse } from "next/server"
import { identitySwitchLogService } from "@/lib/services/identity-switch-service"
import { userService } from "@/modules/users"
import { supabaseUserRepo } from "@/modules/users/supabase/repository"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { verifyPassword } from "@/shared/auth/password"
import { checkLoginRateLimit } from "@/shared/auth/login-rate-limit"
import { setSessionCookies } from "@/shared/auth/auth-cookies"
import { SESSION_COOKIE, REAL_SESSION_COOKIE } from "@/shared/auth/auth"
import { verifySessionTokenDetailed } from "@/shared/auth/session-cookie"
import { sessionRevocationService } from "@/lib/services/session-revocation-service"
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
    if (!(await checkLoginRateLimit(`${clientIp}:${email}`))) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait 15 minutes and try again." },
        { status: 429 },
      )
    }

    let user
    try {
      user = await userService.findByEmail(email)
    } catch (err) {
      logError("auth.login.user_lookup", err, { email })
      return NextResponse.json(
        {
          error:
            "Database unavailable. Check that Vercel has the correct Supabase URL and service-role key for this project.",
        },
        { status: 503 },
      )
    }
    if (!user || !user.active) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    let passwordOk = false
    try {
      passwordOk = verifyPassword(password, user.passwordHash)
    } catch (err) {
      logError("auth.login.verify_password", err, { userId: user.id })
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }
    if (!passwordOk) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // When Supabase is the primary user store, ensure this user exists there
    // before issuing a session cookie. On Vercel every request may land on a
    // fresh serverless container with an empty /tmp SQLite, so the session
    // must be resolvable via Supabase on subsequent requests.
    if (isSupabaseOnly()) {
      try {
        await supabaseUserRepo.upsert(user)
      } catch (err) {
        logError("auth.login.supabase_sync", err, { userId: user.id })
        return NextResponse.json(
          { error: "Database sync error. Check Supabase configuration and ensure the users migration has been applied." },
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
    }).catch((err) => {
      // Never block sign-in on audit failures (e.g. missing SQLite table on Vercel).
      logError("auth.login.audit", err, { userId: user.id })
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

    // M3: if any existing (possibly stolen) session cookies are present in the
    // browser, revoke their signatures before rotating to the fresh ones.
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

    await setSessionCookies(res, user.id, user.id, {
      mustChangePassword: user.mustChangePassword === 1,
    })

    return res
  } catch (err) {
    return apiInternalError("auth.login", err)
  }
}
