import { NextResponse } from "next/server"
import { requireModuleAccess } from "@/shared/auth/auth"
import { listResponse } from "@/shared/utils/api-cache"
import { apiInternalError } from "@/shared/api-errors"
import { listDesignerEligibleNames } from "../services/designer-directory"

/**
 * Designer picker options — active Admin + Engineer names only.
 * Accounts users are excluded (not designer-eligible).
 */
export async function GET() {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const designers = await listDesignerEligibleNames()
    return listResponse({ designers })
  } catch (err) {
    return apiInternalError("jobs.api.designers", err)
  }
}
