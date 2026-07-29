import { NextResponse } from "next/server"
import { userService } from "@/modules/users"
import { requireModuleAccess } from "@/shared/auth/auth"
import { listResponse } from "@/shared/utils/api-cache"
import { apiInternalError } from "@/shared/api-errors"

/**
 * Designer picker options — active Users-tab names only (Admin + Engineer).
 * Used by job list / form dropdowns so assignment matches Performance.
 */
export async function GET() {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const names = await userService.findActiveNames()
    const designers = [...new Set(names)].sort((a, b) => a.localeCompare(b))

    return listResponse({ designers })
  } catch (err) {
    return apiInternalError("jobs.api.designers", err)
  }
}
