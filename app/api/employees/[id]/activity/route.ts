import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { employeeActivityDb } from "@/lib/db/stores"
import { employeeService } from "@/lib/services/employee-service"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    if (!employeeService.getDetail(auth.user, id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const activity = employeeActivityDb.findByUser(id, 50)
    return NextResponse.json({ activity })
  } catch (err) {
    console.error("[GET /api/employees/[id]/activity]", err)
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 })
  }
}
