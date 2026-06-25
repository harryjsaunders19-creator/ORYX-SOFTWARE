import { NextRequest, NextResponse } from "next/server"
import { userDb } from "@/lib/db"
import { requireRole, getCurrentUser } from "@/lib/auth"
import { isValidRole } from "@/lib/permissions"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const user = userDb.findUnique(id)
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const existing = userDb.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const willDemote  = body.role !== undefined && isValidRole(body.role) && body.role !== "ADMIN" && existing.role === "ADMIN"
    const willDisable = body.active !== undefined && !body.active && existing.active === 1

    // Never let the last active Admin be demoted or disabled — that would lock everyone out of user management.
    if ((willDemote || willDisable) && existing.role === "ADMIN" && existing.active === 1 && userDb.activeAdminCount() <= 1) {
      return NextResponse.json({ error: "Can't remove the last active Admin." }, { status: 409 })
    }

    if (body.email !== undefined && body.email) {
      const dup = userDb.findByEmail(String(body.email))
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: `A user with email "${body.email}" already exists.` }, { status: 409 })
      }
    }

    if (body.role !== undefined && !isValidRole(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 422 })
    }

    const updated = userDb.update(id, {
      ...(body.name   !== undefined && { name:   String(body.name).trim() }),
      ...(body.email  !== undefined && { email:  body.email ? String(body.email).trim() : null }),
      ...(body.role   !== undefined && { role:   body.role as "ADMIN" | "ENGINEER" }),
      ...(body.active !== undefined && { active: body.active ? 1 : 0 }),
    })
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[PATCH /api/users/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const target = userDb.findUnique(id)
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const me = await getCurrentUser()
    if (me && me.id === id) {
      return NextResponse.json({ error: "You can't delete your own account while logged in." }, { status: 409 })
    }

    if (target.role === "ADMIN" && target.active === 1 && userDb.activeAdminCount() <= 1) {
      return NextResponse.json({ error: "Can't delete the last active Admin." }, { status: 409 })
    }

    const ok = userDb.delete(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error("[DELETE /api/users/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
