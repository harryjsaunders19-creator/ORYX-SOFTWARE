import { NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { notificationService } from "@/lib/services/notification-service"
import { listResponse } from "@/lib/api-cache"

export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    return listResponse(await notificationService.list())
  } catch (err) {
    console.error("[GET /api/notifications]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
