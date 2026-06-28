import { NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { calendarService } from "@/lib/services/calendar-service"

export async function GET() {
  const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

  try {
    return NextResponse.json({ categories: await calendarService.categories() })
  } catch (err) {
    console.error("[GET /api/calendar/categories]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
