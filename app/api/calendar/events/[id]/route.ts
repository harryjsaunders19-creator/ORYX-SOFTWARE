import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, requireRole } from "@/lib/auth"
import { calendarDb, userDb } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

  try {
    const { id } = await params
    const event = calendarDb.findUnique(id)
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(event)
  } catch (err) {
    console.error("[GET /api/calendar/events/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

  try {
    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    if (body.categoryId !== undefined) {
      const categories = calendarDb.categories()
      if (!categories.find(c => c.id === String(body.categoryId))) {
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

    const updated = calendarDb.update(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (Array.isArray(body.assigneeIds)) {
      const validIds = (body.assigneeIds as string[]).filter(uid => typeof uid === "string" && userDb.findUnique(uid))
      calendarDb.setAssignees(id, validIds)
    }

    const full = calendarDb.findUnique(id)
    return NextResponse.json(full)
  } catch (err) {
    console.error("[PATCH /api/calendar/events/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    if (!calendarDb.findUnique(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    calendarDb.delete(id)
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error("[DELETE /api/calendar/events/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
