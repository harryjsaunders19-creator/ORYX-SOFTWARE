import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { calendarService } from "@/lib/services/calendar-service"
import { userService } from "@/lib/services/user-service"
import { createId } from "@paralleldrive/cuid2"

export async function GET(req: NextRequest) {
  const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

  try {
    const sp   = req.nextUrl.searchParams
    const from = sp.get("from")
    const to   = sp.get("to")

    if (!from || !to) {
      return NextResponse.json({ error: "from and to date parameters are required" }, { status: 422 })
    }

    const events = await calendarService.findMany({
      from, to,
      userId:     sp.get("userId")     ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
      jobId:      sp.get("jobId")      ?? undefined,
      clientId:   sp.get("clientId")   ?? undefined,
    })

    return NextResponse.json({ events })
  } catch (err) {
    console.error("[GET /api/calendar/events]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const title = typeof body.title === "string" ? body.title.trim() : ""
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 422 })

    const categoryId = typeof body.categoryId === "string" ? body.categoryId : ""
    if (!categoryId) return NextResponse.json({ error: "Category is required" }, { status: 422 })
    const categories = await calendarService.categories()
    if (!categories.find(c => c.id === categoryId)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 422 })
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
    console.error("[POST /api/calendar/events]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
