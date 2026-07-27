import { NextResponse } from "next/server"
import { userService } from "@/modules/users"
import { requireSignIn } from "@/shared/auth/auth"
import { listResponse } from "@/shared/utils/api-cache"
import { apiInternalError } from "@/shared/api-errors"

/**
 * Designer picker options — active Users-tab names only (Admin + Engineer).
 * Used by job list / form dropdowns so assignment matches Performance.
 */
export async function GET() {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const users = await userService.findMany({ activeOnly: true })
    const designers = [...new Set(
      users
        .map(u => u.name.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b))

    return listResponse({ designers })
  } catch (err) {
    return apiInternalError("jobs.api.designers", err)
  }
}
