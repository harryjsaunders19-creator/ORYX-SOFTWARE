/**
 * POST /api/admin/reset-data
 *
 * Wipes all jobs, clients, quotes, billing data, and sequences.
 * Preserves user accounts. Requires ADMIN role + password confirmation.
 * When Supabase is linked, clears Supabase first then the local SQLite mirror.
 */
import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireRole } from "@/lib/auth"
import { verifyPassword } from "@/lib/password"
import { resetSystemData } from "@/lib/services/reset-data-service"

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

    const counts = await resetSystemData()

    console.log(`[RESET ALL DATA] Performed by ${auth.user.name} (${auth.user.email}). Cleared ${counts.jobCount} jobs, ${counts.clientCount} clients, ${counts.quoteCount} quotes.`)

    return NextResponse.json({ ok: true, cleared: counts })
  } catch (err) {
    return apiInternalError("app.admin.reset-data.route", err)
  }
}
