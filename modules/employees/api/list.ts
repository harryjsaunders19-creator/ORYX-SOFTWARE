import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { listResponse } from "@/shared/utils/api-cache"
import { requireModuleAccess } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const page = parsePageParam(sp.get("page"))
    const limit = parseLimitParam(sp.get("limit"), 50, 100)

    const result = await employeeService.findMany(auth.user, {
      search: sp.get("search") ?? undefined,
      department: sp.get("department") ?? undefined,
      status: sp.get("status") ?? undefined,
      page,
      limit,
      sortBy: sp.get("sortBy") ?? undefined,
      sortDir: (sp.get("sortDir") === "desc" ? "desc" : "asc"),
    })

    return listResponse({ ...result, page, limit })
  } catch (err) {
    return apiInternalError("employees.api.list", err)
  }
}
