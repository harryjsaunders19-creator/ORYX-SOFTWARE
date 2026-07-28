/**
 * lib/auth.ts
 *
 * Server-side identity + permission enforcement for API routes.
 *
 * Login is via email/password (POST /api/auth/login). Session identity is
 * stored in httpOnly cookies. Admin impersonation uses a separate real-user
 * cookie so switching identity mid-session is restricted and audited.
 */
import { cache } from "react"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import type { UserRow } from "@/modules/users/types"
import type { Role } from "@/shared/types/role"
import { userService } from "@/modules/users"
import {
  canAccessModule,
  getModule,
  parseModuleAccessJson,
} from "@/shared/auth/permissions"
import {
  verifySessionTokenDetailed,
  SESSION_COOKIE,
  REAL_SESSION_COOKIE,
} from "@/shared/auth/session-cookie"
import { sessionRevocationService } from "@/lib/services/session-revocation-service"

export { SESSION_COOKIE, REAL_SESSION_COOKIE }

export function passwordChangeRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: "Password change required", mustChangePassword: true },
    { status: 403 },
  )
}

async function userIdFromCookie(name: string): Promise<string | null> {
  const store = await cookies()
  const detailed = await verifySessionTokenDetailed(store.get(name)?.value)
  if (!detailed) return null

  // M3: block specific stolen cookies early, even before exp.
  if (await sessionRevocationService.isTokenRevoked(detailed.tokenSig)) return null
  return detailed.userId
}

/**
 * Perf: React.cache() memoizes per incoming request so parallel API handlers
 * (e.g. /api/jobs + /api/hold-list + /api/jobs/designers) share one cookie
 * verify + user row load instead of repeating the work N times.
 */
export const getCurrentUser = cache(async (): Promise<UserRow | null> => {
  const uid = await userIdFromCookie(SESSION_COOKIE)
  if (!uid) return null
  const user = await userService.findUnique(uid)
  if (!user || !user.active) return null
  return user
})

/** Perf: same request-scoped memo as getCurrentUser for impersonation checks. */
export const getRealUser = cache(async (): Promise<UserRow | null> => {
  const uid = await userIdFromCookie(REAL_SESSION_COOKIE)
  if (!uid) return null
  const user = await userService.findUnique(uid)
  if (!user || !user.active) return null
  return user
})

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

/**
 * Sign-in + per-user module access (admin toggles on Users).
 * Fail-closed for unknown module keys — unlike nav helpers.
 */
export async function requireModuleAccess(moduleKey: string): Promise<RoleCheckResult> {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth

  if (!getModule(moduleKey)) {
    return NextResponse.json({ error: "You don't have permission to access this." }, { status: 403 })
  }

  const moduleAccess = parseModuleAccessJson(auth.user.moduleAccessJson)
  if (!canAccessModule(auth.user.role as Role, moduleKey, moduleAccess)) {
    return NextResponse.json({ error: "You don't have permission to access this." }, { status: 403 })
  }
  return auth
}

/** Display name for audit fields — never trust client-supplied changedBy. */
export function actorName(user: UserRow): string {
  return user.name?.trim() || user.email?.trim() || "System"
}
