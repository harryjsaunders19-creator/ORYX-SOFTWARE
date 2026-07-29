import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { holdService } from "../services/hold-service"
import { requireModuleAccess } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("hold-list")
    if (auth instanceof NextResponse) return auth

    // Job list only needs clientId for hold badges — skip N+1-style enrichment.
    if (req.nextUrl.searchParams.get("fields") === "clientId") {
      const holds = await holdService.allActiveClientIds()
      return listResponse({ holds, total: holds.length })
    }

    const holds = await holdService.allActive()
    return listResponse({ holds, total: holds.length })
  } catch (err) {
    return apiInternalError("clients.hold.list", err)
  }
}
