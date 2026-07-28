import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireModuleAccess } from "@/shared/auth/auth"
import { calendarService } from "../services/calendar-service"
import { filterUserCategories } from "../config/category-config"

export async function GET() {
  const auth = await requireModuleAccess("calendar")
  if (auth instanceof NextResponse) return auth

  try {
    const all = await calendarService.categories()
    return NextResponse.json({ categories: filterUserCategories(all) })
  } catch (err) {
    return apiInternalError("calendar.api.categories", err)
  }
}
