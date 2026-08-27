/**
 * Security response headers applied via the Next.js proxy (edge) entry.
 * Kept narrow enough for /login and the rest of the app shell.
 */
import type { NextResponse } from "next/server"

/**
 * CSP for the App Router UI (login + authenticated shell).
 * Allows Next.js inline bootstraps (unsafe-inline) but not eval.
 * Connect: self + optional Supabase realtime/rest when configured.
 */
export function buildContentSecurityPolicy(opts?: { supabaseOrigin?: string | null }): string {
  const supabase = opts?.supabaseOrigin?.replace(/\/$/, "") || null
  const connect = ["'self'"]
  if (supabase) {
    connect.push(supabase)
    // Realtime uses WebSockets — https origins do not imply wss under CSP3.
    try {
      const host = new URL(supabase).host
      if (host) connect.push(`wss://${host}`)
    } catch {
      /* ignore malformed URL */
    }
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    `connect-src ${connect.join(" ")}`,
  ].join("; ")
}

/** Mutates and returns the same response for chaining. */
export function applySecurityHeaders(
  res: NextResponse,
  opts?: { supabaseOrigin?: string | null },
): NextResponse {
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  )
  res.headers.set("Content-Security-Policy", buildContentSecurityPolicy(opts))
  // HSTS only meaningful on HTTPS; harmless on localhost (browsers ignore).
  if (process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
  return res
}
