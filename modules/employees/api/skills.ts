import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { employeeService } from "@/modules/employees"
import { SKILL_CATEGORIES, type SkillCategory } from "@/modules/employees"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    let body: { name?: string; level?: string; yearsExperience?: number; category?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: "Skill name is required" }, { status: 422 })

    const category = (body.category && SKILL_CATEGORIES.includes(body.category as SkillCategory)
      ? body.category
      : "SKILL") as SkillCategory

    const skill = await employeeService.addSkill(auth.user, id, {
      name,
      level: body.level,
      yearsExperience: body.yearsExperience,
      category,
    })
    if (!skill) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json({ skill }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/employees/[id]/skills]", err)
    return NextResponse.json({ error: "Failed to add skill" }, { status: 500 })
  }
}
