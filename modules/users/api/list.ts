import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { userService } from "../services/user-service"
import { withoutPassword } from "../types/user-types"
import { createId } from "@paralleldrive/cuid2"
import { requireRole } from "@/shared/auth/auth"
import { isValidRole, DEFAULT_ROLE } from "@/shared/auth/permissions"
import { generateTempPassword, hashPassword } from "@/lib/password"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const users = (await userService.findMany()).map(withoutPassword)
    return NextResponse.json({ users, total: users.length })
  } catch (err) {
    return apiInternalError("users.api.list", err)
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

    const existing = await userService.findByEmail(email)
    if (existing) return NextResponse.json({ error: `A user with email "${email}" already exists.` }, { status: 409 })

    const role = isValidRole(body.role) ? body.role : DEFAULT_ROLE
    const tempPassword = generateTempPassword()

    const user = await userService.create({
      id: createId(),
      name,
      email,
      role,
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: 1,
    })

    return NextResponse.json({ user: withoutPassword(user), tempPassword }, { status: 201 })
  } catch (err) {
    return apiInternalError("users.api.list", err)
  }
}
