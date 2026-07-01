import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { notificationService } from "../services/notification-service"
import { listResponse } from "@/shared/utils/api-cache"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    return listResponse(await notificationService.list(auth.user))
  } catch (err) {
    console.error("[GET /api/notifications]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
