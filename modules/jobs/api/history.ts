import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { jobService } from "../services/job-service"
import { historyService } from "../services/history-service"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"

type Ctx = { params: Promise<{ id: string }> }

const addHistoryNoteBodySchema = z.object({
  note: z.string().optional(),
}).passthrough()

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
    return apiInternalError("jobs.history.get", err)
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

    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const parsedBody = addHistoryNoteBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data

    const note      = body.note?.trim()
    const changedBy = actorName(auth.user)

    if (!note) return NextResponse.json({ error: "note is required" }, { status: 422 })

    const entry = await historyService.addNote(id, note, changedBy)
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    return apiInternalError("jobs.history.note", err)
  }
}
