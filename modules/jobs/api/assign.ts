import { NextRequest, NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { requireSignIn } from "@/shared/auth/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await jobService.findUnique(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })

    let body: { designer?: string; changedBy?: string }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const designer  = typeof body.designer  === "string" ? body.designer.trim()  : ""
    const changedBy = typeof body.changedBy === "string" && body.changedBy.trim()
      ? body.changedBy.trim() : "System"

    if (!designer) return NextResponse.json({ error: "Designer name is required" }, { status: 422 })

    const result = await jobService.assignDesigner(id, designer, changedBy)
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ job: result.job })
  } catch (err) {
    console.error("[POST /api/jobs/[id]/assign]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
