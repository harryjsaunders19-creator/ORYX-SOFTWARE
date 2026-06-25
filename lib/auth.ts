/**
 * lib/auth.ts
 *
 * Server-side identity + permission enforcement for API routes.
 *
 * There is still no password-based login (see components/user-context.tsx
 * and /api/auth/switch) — identity selection for a brand-new browser
 * session is still "pick who you are from a list," because there is no
 * credential to check it against. That residual gap is real and is
 * documented plainly in PROJECT_OVERVIEW.md §27 rather than glossed over:
 * anyone who can reach this app at all can still become anyone by logging
 * out and picking a different identity from scratch. What this file *does*
 * now genuinely enforce is everything downstream of that first pick:
 * once a real identity is established for a session, switching to a
 * *different* identity without logging out first — i.e. impersonation —
 * is restricted to admins, is logged permanently, and never silently
 * grants the impersonated identity admin powers it doesn't actually have.
 *
 * Two cookies, two different meanings:
 *   - REAL_SESSION_COOKIE: who is genuinely signed in to this browser
 *     session. Only ever set by a from-scratch identity pick or a real
 *     logout. Never changed by impersonation.
 *   - ACTIVE_SESSION_COOKIE: who the app is currently acting as — equal to
 *     the real identity except during an active, admin-authorized
 *     impersonation. This is what getCurrentUser() returns, and what
 *     every existing call site (attribution fields, role checks, page
 *     access) already uses — so "acting as" a non-admin correctly and
 *     deliberately also restricts what an impersonating admin can do for
 *     the duration, the same as if they'd actually logged in as that
 *     person.
 *
 * The role itself is always re-read from the database on every request —
 * never trusted from a client-sent value. That was already true before
 * this change and remains the thing that makes any of this real rather
 * than cosmetic.
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { userDb, type UserRow } from "@/lib/db"
import type { Role } from "@/lib/permissions"

export const SESSION_COOKIE = "oryx_uid"          // kept under its original name — this is the ACTIVE/acting-as identity
export const REAL_SESSION_COOKIE = "oryx_real_uid" // new — the genuinely authenticated identity for this browser session

/** The identity the app is currently acting as — unchanged meaning from
 *  before this fix. Used for attribution (createdBy/changedBy/…) and for
 *  every existing role/permission check, so impersonating a non-admin
 *  genuinely behaves as that non-admin for the duration. */
export async function getCurrentUser(): Promise<UserRow | null> {
  const store = await cookies()
  const uid = store.get(SESSION_COOKIE)?.value
  if (!uid) return null
  const user = userDb.findUnique(uid)
  if (!user || !user.active) return null
  return user
}

/** The genuinely authenticated identity for this browser session —
 *  unaffected by impersonation. This is what authorizes *whether a switch
 *  is allowed at all*, specifically so an admin impersonating a non-admin
 *  can't use that impersonated session to then impersonate someone else;
 *  only the real, underlying identity's own role ever grants that. */
export async function getRealUser(): Promise<UserRow | null> {
  const store = await cookies()
  const uid = store.get(REAL_SESSION_COOKIE)?.value
  if (!uid) return null
  const user = userDb.findUnique(uid)
  if (!user || !user.active) return null
  return user
}

/** True when the active identity differs from the real one — i.e. an
 *  admin is currently impersonating someone else. */
export async function isImpersonating(): Promise<boolean> {
  const [active, real] = await Promise.all([getCurrentUser(), getRealUser()])
  return !!active && !!real && active.id !== real.id
}

export type RoleCheckResult = { user: UserRow } | NextResponse

/**
 * For routes both roles can call, but which must redact commercial fields
 * for Engineers (stats, jobs, quotes, …). Defaults to the more restrictive
 * "ENGINEER" role when nobody is signed in — fail closed, never leak
 * commercial data just because no identity has been picked yet.
 */
export async function getCurrentRole(): Promise<Role> {
  const user = await getCurrentUser()
  return (user?.role as Role) ?? "ENGINEER"
}

/**
 * Use at the top of any route handler that should be restricted to
 * specific roles:
 *
 *   const auth = await requireRole(["ADMIN"])
 *   if (auth instanceof NextResponse) return auth
 *   const { user } = auth
 *
 * Returns 401 if nobody is "signed in" (no valid session cookie), 403 if
 * the signed-in user's role isn't in `roles`. Checks the *active* identity
 * deliberately — see the file header comment on why impersonating a
 * non-admin should genuinely restrict admin-only routes too.
 */
export async function requireRole(roles: Role[]): Promise<RoleCheckResult> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
  }
  if (!roles.includes(user.role as Role)) {
    return NextResponse.json({ error: "You don't have permission to access this." }, { status: 403 })
  }
  return { user }
}
