import { NextResponse } from "next/server"
import { userService } from "@/lib/services/user-service"
import { requireSignIn } from "@/lib/auth"
import { apiInternalError } from "@/shared/api-errors"

/** Minimal public shape for account pickers — never expose email or password metadata. */
export type AuthUserPickerEntry = { id: string; name: string; role: string }

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const users: AuthUserPickerEntry[] = (await userService.findMany({ activeOnly: true }))
      .map(u => ({ id: u.id, name: u.name, role: u.role }))
    return NextResponse.json({ users })
  } catch (err) {
    return apiInternalError("auth.users.list", err)
  }
}
