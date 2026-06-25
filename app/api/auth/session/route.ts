import { NextResponse } from "next/server"
import { getCurrentUser, getRealUser } from "@/lib/auth"

export async function GET() {
  try {
    const [rawUser, realUser] = await Promise.all([getCurrentUser(), getRealUser()])
    const impersonating = !!rawUser && !!realUser && rawUser.id !== realUser.id
    const user = rawUser ? { id: rawUser.id, name: rawUser.name, email: rawUser.email, role: rawUser.role, active: rawUser.active, createdAt: rawUser.createdAt, updatedAt: rawUser.updatedAt } : null
    return NextResponse.json({
      user,
      mustChangePassword: rawUser?.mustChangePassword === 1,
      isImpersonating: impersonating,
      realUser: impersonating ? { id: realUser!.id, name: realUser!.name } : null,
    })
  } catch (err) {
    console.error("[GET /api/auth/session]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
