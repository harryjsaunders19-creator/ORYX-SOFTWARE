import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Must match SESSION_COOKIE in lib/auth.ts — inlined here because middleware
 *  runs on the Edge runtime and cannot import lib/db / better-sqlite3. */
const SESSION_COOKIE = "oryx_uid"

const PUBLIC_PAGES = new Set(["/login", "/set-password"])

/** API routes that must work before a session cookie exists. */
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
]

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next()
    if (!hasSession) {
      return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    }
    return NextResponse.next()
  }

  if (!hasSession && !PUBLIC_PAGES.has(pathname)) {
    const login = new URL("/login", request.url)
    login.searchParams.set("from", pathname)
    return NextResponse.redirect(login)
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
