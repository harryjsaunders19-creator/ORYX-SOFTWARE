/**
 * POST /api/users/[id]/reset-password
 *
 * Admin-only. Generates a new temporary password for a user and sets
 * mustChangePassword = true, forcing them to choose a new one on next login.
 */
import { NextRequest, NextResponse } from "next/server"
import { userDb } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import { generateTempPassword, hashPassword } from "@/lib/password"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const user = userDb.findUnique(id)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const tempPassword = generateTempPassword()

    userDb.update(id, {
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: 1,
    })

    return NextResponse.json({ tempPassword })
  } catch (err) {
    console.error("[POST /api/users/[id]/reset-password]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
