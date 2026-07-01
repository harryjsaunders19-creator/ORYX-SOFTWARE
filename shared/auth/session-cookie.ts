/**
 * Signed session tokens for httpOnly auth cookies.
 * Uses Web Crypto so the same logic works in Node route handlers and Edge middleware.
 *
 * Format: v1.{userId}.{expUnixSec}.{base64url-hmac-sha256}
 */

export const SESSION_COOKIE = "oryx_uid"
export const REAL_SESSION_COOKIE = "oryx_real_uid"

const VERSION = "v1"
const enc = new TextEncoder()

export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30 // 30 days

export function getAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET must be set in production — session cookies cannot be secured without it.",
    )
  }
  console.warn("[auth] AUTH_SECRET is not set — using a dev-only default. Set AUTH_SECRET before deploying.")
  return "oryx-dev-auth-secret-change-me"
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
    secure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  }
}

async function importHmacKey(sign: boolean) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    sign ? ["sign"] : ["verify"],
  )
}

function toBase64Url(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)
  const bin = atob(padded)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function signPayload(payload: string): Promise<string> {
  const key = await importHmacKey(true)
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  return toBase64Url(sig)
}

async function verifyPayload(payload: string, signature: string): Promise<boolean> {
  try {
    const key = await importHmacKey(false)
    const sigBytes = fromBase64Url(signature)
    return crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, enc.encode(payload))
  } catch {
    return false
  }
}

/** Mint a signed session token for a user id. */
export async function createSessionToken(userId: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC
  const payload = `${userId}.${exp}`
  const sig = await signPayload(payload)
  return `${VERSION}.${payload}.${sig}`
}

/** Verify token and return the user id, or null if invalid/expired. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token || !token.startsWith(`${VERSION}.`)) return null

  const rest = token.slice(VERSION.length + 1)
  const sigSep = rest.lastIndexOf(".")
  if (sigSep === -1) return null

  const payload = rest.slice(0, sigSep)
  const signature = rest.slice(sigSep + 1)
  const dot = payload.indexOf(".")
  if (dot === -1) return null

  const userId = payload.slice(0, dot)
  const exp = parseInt(payload.slice(dot + 1), 10)
  if (!userId || isNaN(exp) || exp < Math.floor(Date.now() / 1000)) return null

  const ok = await verifyPayload(payload, signature)
  return ok ? userId : null
}

/** Quick presence check for middleware — valid format + not expired (includes HMAC verify). */
export async function hasValidSessionToken(token: string | undefined): Promise<boolean> {
  return (await verifySessionToken(token)) !== null
}
