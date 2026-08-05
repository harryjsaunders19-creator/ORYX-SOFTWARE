/**
 * POST /api/users/[id]/reset-password
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { userService } from "../services/user-service"
import { requireRole, requireFullAccess } from "@/shared/auth/auth"
import { generateTempPassword, hashPassword } from "@/shared/auth/password"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const user = await userService.findUnique(id)
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const tempPassword = generateTempPassword()

    await userService.update(id, {
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: 1,
    })

    return NextResponse.json({ tempPassword })
  } catch (err) {
    return apiInternalError("users.api.reset-password", err)
  }
}
