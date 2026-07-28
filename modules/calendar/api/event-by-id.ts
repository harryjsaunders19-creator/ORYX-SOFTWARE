import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireModuleAccess, requireRole } from "@/shared/auth/auth"
import type { UpdateCalendarEventData } from "../types/calendar-types"
import { calendarService } from "../services/calendar-service"
import { userService } from "@/modules/users"
import { isUserSelectableCategory } from "../config/category-config"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireModuleAccess("calendar")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const event = await calendarService.findUnique(id)
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(event)
  } catch (err) {
    return apiInternalError("calendar.api.event-by-id", err)
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireModuleAccess("calendar")
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const existing = await calendarService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const isAdmin = auth.user.role === "ADMIN"
    const isCreator = existing.createdBy === auth.user.id
    const isAssignee = existing.assignees.some(a => a.userId === auth.user.id)
    if (!isAdmin && !isCreator && !isAssignee) {
      return NextResponse.json({ error: "You don't have permission to edit this event." }, { status: 403 })
    }
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    if (body.categoryId !== undefined) {
      const cat = String(body.categoryId)
      if (!isUserSelectableCategory(cat)) {
        return NextResponse.json({ error: "Invalid category" }, { status: 422 })
      }
    }

    if (body.startDate !== undefined && body.endDate !== undefined) {
      if (String(body.endDate) < String(body.startDate)) {
        return NextResponse.json({ error: "End date must be on or after start date" }, { status: 422 })
      }
    }

    const data: Record<string, unknown> = {}
    const allowed = ["title", "description", "categoryId", "startDate", "endDate", "allDay", "location", "priority", "status", "jobId", "clientId"]
    for (const f of allowed) {
      if (body[f] !== undefined) data[f] = body[f]
    }

    const assigneeIds = Array.isArray(body.assigneeIds)
      ? await userService.filterExistingIds(body.assigneeIds as string[])
      : undefined

    const full = await calendarService.update(id, data as UpdateCalendarEventData, assigneeIds)
    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json(full)
  } catch (err) {
    return apiInternalError("calendar.api.event-by-id", err)
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    if (!(await calendarService.findUnique(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await calendarService.delete(id)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    return apiInternalError("calendar.api.event-by-id", err)
  }
}
