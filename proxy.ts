import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  SESSION_COOKIE,
  MUST_CHANGE_PASSWORD_COOKIE,
  hasValidSessionToken,
} from "@/lib/session-cookie"
import { isExperimentalEnabled } from "@/lib/experimental-features"

const PUBLIC_PAGES = new Set(["/login", "/set-password"])

/** API routes that must work before a session cookie exists. */
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/ping",
]

/** API routes allowed while must-change-password is pending. */
const PASSWORD_CHANGE_API_PREFIXES = [
  "/api/auth/set-password",
  "/api/auth/session",
  "/api/auth/logout",
]

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + "/"),
  )
}

function isPublicApi(pathname: string): boolean {
  return matchesPrefix(pathname, PUBLIC_API_PREFIXES)
}

function isPasswordChangeApi(pathname: string): boolean {
  return matchesPrefix(pathname, PASSWORD_CHANGE_API_PREFIXES)
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

/** Reject cross-origin mutating API calls when Origin/Referer is present and mismatches. */
function originAllowed(request: NextRequest): boolean {
  const expected = request.nextUrl.origin
  const origin = request.headers.get("origin")
  if (origin) return origin === expected
  const referer = request.headers.get("referer")
  if (referer) {
    try {
      return new URL(referer).origin === expected
    } catch {
      return false
    }
  }
  // Authenticated browser fetch always sends Origin; allow missing for
  // same-site navigations / older clients on non-login routes.
  return true
}

/** Login CSRF: require Origin or Referer to match (no silent allow). */
function originAllowedStrict(request: NextRequest): boolean {
  if (process.env.E2E === "true") return true
  const expected = request.nextUrl.origin
  const origin = request.headers.get("origin")
  if (origin) return origin === expected
  const referer = request.headers.get("referer")
  if (referer) {
    try {
      return new URL(referer).origin === expected
    } catch {
      return false
    }
  }
  return false
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    (pathname.startsWith("/employees") || pathname.startsWith("/api/employees"))
    && !isExperimentalEnabled("employees")
  ) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "This feature is not available yet" }, { status: 404 })
    }
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (pathname.startsWith("/api/leave") && !isExperimentalEnabled("leave")) {
    return NextResponse.json({ error: "This feature is not available yet" }, { status: 404 })
  }

  // Perf: skip HMAC for public GET-ish auth routes; mutating public routes
  // still need CSRF Origin checks (especially login).
  if (pathname.startsWith("/api/") && isPublicApi(pathname)) {
    if (
      MUTATING_METHODS.has(request.method)
      && pathname === "/api/auth/login"
      && !originAllowedStrict(request)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (
      MUTATING_METHODS.has(request.method)
      && pathname !== "/api/auth/login"
      && pathname !== "/api/auth/logout"
      && pathname !== "/api/auth/session"
      && !originAllowed(request)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.next()
  }

  if (
    pathname.startsWith("/api/")
    && MUTATING_METHODS.has(request.method)
    && !originAllowed(request)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Perf: public pages with no cookie need no HMAC work.
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token && PUBLIC_PAGES.has(pathname)) {
    return NextResponse.next()
  }

  const hasSession = await hasValidSessionToken(token)
  const mustChangePassword = request.cookies.get(MUST_CHANGE_PASSWORD_COOKIE)?.value === "1"

  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    }
    if (mustChangePassword && !isPasswordChangeApi(pathname)) {
      return NextResponse.json(
        { error: "Password change required", mustChangePassword: true },
        { status: 403 },
      )
    }
    return NextResponse.next()
  }

  if (!hasSession && !PUBLIC_PAGES.has(pathname)) {
    const login = new URL("/login", request.url)
    login.searchParams.set("from", pathname)
    return NextResponse.redirect(login)
  }

  if (hasSession && mustChangePassword && pathname !== "/set-password") {
    return NextResponse.redirect(new URL("/set-password", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * All routes except static assets (images, fonts, favicons, branding).
     * API routes are included so unauthenticated requests are rejected early.
     */
    "/((?!_next/static|_next/image|favicon|icon-|apple-touch|branding|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
}
