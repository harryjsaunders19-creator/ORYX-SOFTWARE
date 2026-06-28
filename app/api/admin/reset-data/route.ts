/**
 * POST /api/admin/reset-data
 *
 * Wipes all jobs, clients, quotes, billing data, and sequences.
 * Preserves user accounts. Requires ADMIN role + password confirmation.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { verifyPassword } from "@/lib/password"
import { resetAllData } from "@/lib/db"

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    let body: { password?: string; confirmPhrase?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const password = typeof body.password === "string" ? body.password : ""
    const confirmPhrase = typeof body.confirmPhrase === "string" ? body.confirmPhrase.trim() : ""

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 422 })
    }
    if (confirmPhrase !== "RESET ALL DATA") {
      return NextResponse.json({ error: "Confirmation phrase does not match" }, { status: 422 })
    }

    if (!auth.user.passwordHash) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 })
    }

    if (!verifyPassword(password, auth.user.passwordHash)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 })
    }

    const counts = resetAllData()

    console.log(`[RESET ALL DATA] Performed by ${auth.user.name} (${auth.user.email}). Cleared ${counts.jobCount} jobs, ${counts.clientCount} clients, ${counts.quoteCount} quotes.`)

    return NextResponse.json({ ok: true, cleared: counts })
  } catch (err) {
    console.error("[POST /api/admin/reset-data]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
