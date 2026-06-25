/**
 * GET /api/auth/users
 *
 * Deliberately unauthenticated. This powers the "switch user" identity
 * picker that stands in for a login screen — it needs to list who's
 * available to "sign in as" before anyone has signed in, the same way a
 * real login page lists nothing sensitive either. It returns only id/name/
 * role for active users, never email or anything else.
 *
 * This is NOT the user-management API — that's /api/users (Admin-only,
 * full CRUD). When real authentication replaces the switcher, this route
 * is deleted outright; /api/users is untouched.
 */
import { NextResponse } from "next/server"
import { userDb } from "@/lib/db"

export async function GET() {
  try {
    const users = userDb.findMany({ activeOnly: true })
      .map(u => ({ id: u.id, name: u.name, role: u.role }))
    return NextResponse.json({ users })
  } catch (err) {
    console.error("[GET /api/auth/users]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
