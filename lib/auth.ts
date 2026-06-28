/**
 * lib/auth.ts
 *
 * Server-side identity + permission enforcement for API routes.
 *
 * Login is via email/password (POST /api/auth/login). Session identity is
 * stored in httpOnly cookies. Admin impersonation uses a separate real-user
 * cookie so switching identity mid-session is restricted and audited.
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { UserRow } from "@/lib/db/user-types"
import type { Role } from "@/lib/permissions"
import { userService } from "@/lib/services/user-service"
import { verifySessionToken, SESSION_COOKIE, REAL_SESSION_COOKIE } from "@/lib/session-cookie"

export { SESSION_COOKIE, REAL_SESSION_COOKIE }

export function passwordChangeRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: "Password change required", mustChangePassword: true },
    { status: 403 },
  )
}

async function userIdFromCookie(name: string): Promise<string | null> {
  const store = await cookies()
  return verifySessionToken(store.get(name)?.value)
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const uid = await userIdFromCookie(SESSION_COOKIE)
  if (!uid) return null
  const user = await userService.findUnique(uid)
  if (!user || !user.active) return null
  return user
}

export async function getRealUser(): Promise<UserRow | null> {
  const uid = await userIdFromCookie(REAL_SESSION_COOKIE)
  if (!uid) return null
  const user = await userService.findUnique(uid)
  if (!user || !user.active) return null
  return user
}

export async function isImpersonating(): Promise<boolean> {
  const [active, real] = await Promise.all([getCurrentUser(), getRealUser()])
  return !!active && !!real && active.id !== real.id
}

export type RoleCheckResult = { user: UserRow } | NextResponse

export async function getCurrentRole(): Promise<Role> {
  const user = await getCurrentUser()
  return (user?.role as Role) ?? "ENGINEER"
}

export async function requireRole(roles: Role[]): Promise<RoleCheckResult> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
  }
  if (user.mustChangePassword === 1) {
    return passwordChangeRequiredResponse()
  }
  if (!roles.includes(user.role as Role)) {
    return NextResponse.json({ error: "You don't have permission to access this." }, { status: 403 })
  }
  return { user }
}

/** Sign-in check for routes that any authenticated role may call. */
export async function requireSignIn(): Promise<RoleCheckResult> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
  }
  if (user.mustChangePassword === 1) {
    return passwordChangeRequiredResponse()
  }
  return { user }
}
