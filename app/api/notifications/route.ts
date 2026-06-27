import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { notificationService } from "@/lib/services/notification-service"

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    return NextResponse.json(await notificationService.list())
  } catch (err) {
    console.error("[GET /api/notifications]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
