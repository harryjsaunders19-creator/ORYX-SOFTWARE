import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireModuleAccess } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"

type Ctx = { params: Promise<{ id: string; skillId: string }> }

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id, skillId } = await ctx.params
    const ok = await employeeService.removeSkill(auth.user, id, skillId)
    if (!ok) return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("employees.api.skill-by-id", err)
  }
}
