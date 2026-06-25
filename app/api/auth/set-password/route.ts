/**
 * POST /api/auth/set-password
 *
 * Allows the currently logged-in user to set a new password.
 * Used for the forced password change on first login (mustChangePassword)
 * and for voluntary password changes.
 */
import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { userDb } from "@/lib/db"
import { hashPassword, validatePasswordStrength } from "@/lib/password"

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    let body: { password?: string; confirmPassword?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const password        = typeof body.password        === "string" ? body.password        : ""
    const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : ""

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 422 })
    }

    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 422 })
    }

    const strengthError = validatePasswordStrength(password)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 422 })
    }

    userDb.update(user.id, {
      passwordHash: hashPassword(password),
      mustChangePassword: 0,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[POST /api/auth/set-password]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
