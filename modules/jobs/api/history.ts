import { NextRequest, NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { historyService } from "../services/history-service"
import { requireSignIn } from "@/shared/auth/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const history = await historyService.forJob(id)
    return NextResponse.json({ history })
  } catch (err) {
    console.error("[GET /api/jobs/[id]/history]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST lets the client add a freeform note to the history without changing status
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: { note?: string; changedBy?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const note      = body.note?.trim()
    const changedBy = body.changedBy?.trim() || "System"

    if (!note) return NextResponse.json({ error: "note is required" }, { status: 422 })

    const entry = await historyService.addNote(id, note, changedBy)
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error("[POST /api/jobs/[id]/history]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
