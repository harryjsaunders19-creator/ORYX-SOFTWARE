import { NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { calendarService } from "@/lib/services/calendar-service"
import { filterUserCategories } from "@/lib/calendar/category-config"

export async function GET() {
  const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

  try {
    const all = await calendarService.categories()
    return NextResponse.json({ categories: filterUserCategories(all) })
  } catch (err) {
    console.error("[GET /api/calendar/categories]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
