import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { employeeService } from "@/lib/services/employee-service"

type Ctx = { params: Promise<{ id: string; skillId: string }> }

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id, skillId } = await ctx.params
    const ok = await employeeService.removeSkill(auth.user, id, skillId)
    if (!ok) return NextResponse.json({ error: "Forbidden or not found" }, { status: 403 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error("[DELETE /api/employees/[id]/skills/[skillId]]", err)
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 })
  }
}
