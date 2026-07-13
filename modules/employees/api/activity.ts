import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { requireSignIn } from "@/shared/auth/auth"
import { employeeActivityDb } from "@/lib/db/stores"
import { employeeService } from "@/modules/employees"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    if (!(await employeeService.getDetail(auth.user, id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const activity = employeeActivityDb.findByUser(id, 50)
    return NextResponse.json({ activity })
  } catch (err) {
    return apiInternalError("employees.api.activity", err)
  }
}
