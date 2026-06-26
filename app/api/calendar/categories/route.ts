import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { calendarDb } from "@/lib/db"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

  try {
    return NextResponse.json({ categories: calendarDb.categories() })
  } catch (err) {
    console.error("[GET /api/calendar/categories]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
