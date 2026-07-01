import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { calendarService } from "../services/calendar-service"
import { filterUserCategories } from "../config/category-config"

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
