import { NextRequest, NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { resolveDirectoryDesigner } from "../services/designer-directory"

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

    const resolved = await resolveDirectoryDesigner(
      typeof body.designer === "string" ? body.designer : "",
    )
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 422 })
    if (!resolved.designer) {
      return NextResponse.json({ error: "Designer name is required" }, { status: 422 })
    }

    const changedBy = actorName(auth.user)
    const result = await jobService.assignDesigner(id, resolved.designer, changedBy)
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({ job: result.job })
  } catch (err) {
    return apiInternalError("jobs.assign", err)
  }
}
