import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { listResponse } from "@/shared/utils/api-cache"
import { requireSignIn } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10))
    const limit = Math.max(1, Math.min(100, parseInt(sp.get("limit") ?? "50", 10)))

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
