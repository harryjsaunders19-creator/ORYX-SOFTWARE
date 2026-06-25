import { NextRequest, NextResponse } from "next/server"
import { userDb } from "@/lib/db"
import { createId } from "@paralleldrive/cuid2"
import { requireRole } from "@/lib/auth"
import { isValidRole, DEFAULT_ROLE } from "@/lib/permissions"
import { generateTempPassword, hashPassword } from "@/lib/password"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const users = userDb.findMany().map(({ passwordHash, ...u }) => u)
    return NextResponse.json({ users, total: users.length })
  } catch (err) {
    console.error("[GET /api/users]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 422 })

    const email = typeof body.email === "string" ? body.email.trim() : ""
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 422 })

    const existing = userDb.findByEmail(email)
    if (existing) return NextResponse.json({ error: `A user with email "${email}" already exists.` }, { status: 409 })

    const role = isValidRole(body.role) ? body.role : DEFAULT_ROLE
    const tempPassword = generateTempPassword()

    const user = userDb.create({
      id: createId(),
      name,
      email,
      role,
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: 1,
    })

    return NextResponse.json({ user, tempPassword }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/users]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
