import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { SESSION_COOKIE, hasValidSessionToken } from "@/lib/session-cookie"
import { isExperimentalEnabled } from "@/lib/experimental-features"

const PUBLIC_PAGES = new Set(["/login", "/set-password"])

/** API routes that must work before a session cookie exists. */
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/ping",
]

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + "/"),
  )
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

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const hasSession = await hasValidSessionToken(token)

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
