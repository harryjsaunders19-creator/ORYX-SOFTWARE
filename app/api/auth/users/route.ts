import { NextResponse } from "next/server"
import { userService } from "@/lib/services/user-service"
import { withoutPassword } from "@/lib/db/user-types"
import { requireSignIn } from "@/lib/auth"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const users = (await userService.findMany({ activeOnly: true })).map(withoutPassword)
    return NextResponse.json({ users })
  } catch (err) {
    console.error("[GET /api/auth/users]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
