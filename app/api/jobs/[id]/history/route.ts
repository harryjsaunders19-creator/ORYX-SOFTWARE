import { NextRequest, NextResponse } from "next/server"
import { historyDb, jobDb } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    const { id } = await params
    const job = jobDb.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const history = historyDb.forJob(id)
    return NextResponse.json({ history })
  } catch (err) {
    console.error("[GET /api/jobs/[id]/history]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST lets the client add a freeform note to the history without changing status
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
    const { id } = await params
    const job = jobDb.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: { note?: string; changedBy?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const note      = body.note?.trim()
    const changedBy = body.changedBy?.trim() || "System"

    if (!note) return NextResponse.json({ error: "note is required" }, { status: 422 })

    const entry = historyDb.addNote(id, note, changedBy)
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error("[POST /api/jobs/[id]/history]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
