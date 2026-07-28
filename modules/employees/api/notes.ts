import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireModuleAccess } from "@/shared/auth/auth"
import { employeeService, canViewNotes } from "@/modules/employees"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    const access = await employeeService.getAccess(auth.user, id)
    if (!canViewNotes(access)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const employee = await employeeService.getDetail(auth.user, id)
    return NextResponse.json({ notes: employee?.notes ?? [] })
  } catch (err) {
    return apiInternalError("employees.api.notes", err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireModuleAccess("employees")
    if (auth instanceof NextResponse) return auth
    const { id } = await ctx.params
    let body: { content?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const content = body.content?.trim()
    if (!content) return NextResponse.json({ error: "Note content is required" }, { status: 422 })

    const note = await employeeService.addNote(auth.user, id, content)
    if (!note) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    return NextResponse.json({ note }, { status: 201 })
  } catch (err) {
    return apiInternalError("employees.api.notes", err)
  }
}
