import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { userService } from "../services/user-service"
import { toPublicUser } from "../types/user-types"
import { requireRole, requireFullAccess } from "@/shared/auth/auth"
import { isValidRole, normalizeModuleAccess, serializeModuleAccess, hasFullAccess, parseModuleAccessJson } from "@/shared/auth/permissions"
import type { Role } from "@/shared/types/role"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const user = await userService.findUnique(id)
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(toPublicUser(user))
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const existing = await userService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const willDemote  = body.role !== undefined && isValidRole(body.role) && body.role !== "ADMIN" && existing.role === "ADMIN"
    const willDisable = body.active !== undefined && !body.active && existing.active === 1

    if ((willDemote || willDisable) && existing.role === "ADMIN" && existing.active === 1 && (await userService.activeAdminCount()) <= 1) {
      return NextResponse.json({ error: "Can't remove the last active Admin." }, { status: 409 })
    }

    if (body.email !== undefined && body.email) {
      const dup = await userService.findByEmail(String(body.email))
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: `A user with email "${body.email}" already exists.` }, { status: 409 })
      }
    }

    if (body.role !== undefined && !isValidRole(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 422 })
    }
    if (body.moduleAccess !== undefined && body.moduleAccess !== null && !Array.isArray(body.moduleAccess)) {
      return NextResponse.json({ error: "moduleAccess must be an array or null" }, { status: 422 })
    }

    const normalizedModuleAccess = body.moduleAccess === undefined ? undefined : normalizeModuleAccess(body.moduleAccess)
    const nextRole: Role = body.role !== undefined && isValidRole(body.role) ? body.role : existing.role

    const updated = await userService.update(id, {
      ...(body.name   !== undefined && { name:   String(body.name).trim() }),
      ...(body.email  !== undefined && { email:  body.email ? String(body.email).trim() : null }),
      ...(body.role   !== undefined && { role:   nextRole }),
      ...(body.active !== undefined && { active: body.active ? 1 : 0 }),
      ...((body.role !== undefined || normalizedModuleAccess !== undefined) && {
        moduleAccessJson: hasFullAccess(nextRole)
          ? null
          : serializeModuleAccess(
              normalizedModuleAccess !== undefined
                ? normalizedModuleAccess
                : parseModuleAccessJson(existing.moduleAccessJson),
            ),
      }),
    })
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(toPublicUser(updated))
  } catch (err) {
    return apiInternalError("users.api.by-id", err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const target = await userService.findUnique(id)
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (auth.user.id === id) {
      return NextResponse.json({ error: "You can't delete your own account while logged in." }, { status: 409 })
    }

    if (target.role === "ADMIN" && target.active === 1 && (await userService.activeAdminCount()) <= 1) {
      return NextResponse.json({ error: "Can't delete the last active Admin." }, { status: 409 })
    }

    const ok = await userService.delete(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("users.api.by-id", err)
  }
}
