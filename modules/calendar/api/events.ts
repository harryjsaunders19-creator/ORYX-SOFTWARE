import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { listResponse } from "@/shared/utils/api-cache"
import { requireModuleAccess } from "@/shared/auth/auth"
import { calendarService } from "../services/calendar-service"
import { userService } from "@/modules/users"
import { filterLeaveEventsForViewer } from "@/modules/leave/permissions"
import {
  resolveCategoryFilter,
  isUserSelectableCategory,
  isLeaveCategory,
} from "../config/category-config"
import { isExperimentalEnabled } from "@/shared/experimental/experimental-features"
import { createId } from "@paralleldrive/cuid2"
import { ANNUAL_LEAVE_CATEGORY_ID } from "@/modules/leave/constants"

export async function GET(req: NextRequest) {
  const auth = await requireModuleAccess("calendar")
  if (auth instanceof NextResponse) return auth

  try {
    const sp   = req.nextUrl.searchParams
    const from = sp.get("from")
    const to   = sp.get("to")

    if (!from || !to) {
      return NextResponse.json({ error: "from and to date parameters are required" }, { status: 422 })
    }

    const showLeave = sp.get("showLeave") !== "false"
    const hideRejected = sp.get("hideRejected") !== "false"
    const leaveStatus = sp.get("leaveStatus") ?? undefined
    const department = sp.get("department") ?? undefined

    const categoryFilter = resolveCategoryFilter(sp.get("categoryId"))

    let events = await calendarService.findMany({
      from, to,
      userId:     sp.get("userId")     ?? undefined,
      ...categoryFilter,
      jobId:      sp.get("jobId")      ?? undefined,
      clientId:   sp.get("clientId")   ?? undefined,
    })

    if (!isExperimentalEnabled("leave")) {
      events = events.filter(e => !isLeaveCategory(e.categoryId))
      return listResponse({ events })
    }

    events = filterLeaveEventsForViewer(auth.user, events, {
      showLeave,
      hideRejected,
      leaveStatus,
      department,
      filterUserId: sp.get("leaveUserId") ?? undefined,
    })

    if (!showLeave) {
      events = events.filter(e => e.categoryId !== ANNUAL_LEAVE_CATEGORY_ID)
    }

    return listResponse({ events })
  } catch (err) {
    return apiInternalError("calendar.api.events", err)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireModuleAccess("calendar")
  if (auth instanceof NextResponse) return auth

  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 422 })

    const categoryId = typeof body.categoryId === "string" ? body.categoryId : ""
    if (!categoryId) return NextResponse.json({ error: "Category is required" }, { status: 422 })
    if (!isUserSelectableCategory(categoryId)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 422 })
    }
    if (categoryId === ANNUAL_LEAVE_CATEGORY_ID || (categoryId === "cat_leave" && !isExperimentalEnabled("leave"))) {
      return NextResponse.json({ error: "Annual leave is managed via leave requests" }, { status: 422 })
    }

    const startDate = typeof body.startDate === "string" ? body.startDate : ""
    const endDate   = typeof body.endDate   === "string" ? body.endDate   : ""
    if (!startDate) return NextResponse.json({ error: "Start date is required" }, { status: 422 })
    if (!endDate)   return NextResponse.json({ error: "End date is required" }, { status: 422 })
    if (endDate < startDate) return NextResponse.json({ error: "End date must be on or after start date" }, { status: 422 })

    const id = createId()
    const assigneeIds = Array.isArray(body.assigneeIds)
      ? await userService.filterExistingIds(body.assigneeIds as string[])
      : undefined

    const full = await calendarService.create({
      id, title, categoryId, startDate, endDate,
      description: body.description  ? String(body.description)  : null,
      allDay:      body.allDay === false ? 0 : 1,
      location:    body.location     ? String(body.location)     : null,
      priority:    typeof body.priority === "string" ? body.priority : "MEDIUM",
      status:      typeof body.status   === "string" ? body.status   : "SCHEDULED",
      jobId:       body.jobId    ? String(body.jobId)    : null,
      clientId:    body.clientId ? String(body.clientId) : null,
      createdBy:   auth.user.id,
    }, assigneeIds)

    return NextResponse.json(full, { status: 201 })
  } catch (err) {
    return apiInternalError("calendar.api.events", err)
  }
}
