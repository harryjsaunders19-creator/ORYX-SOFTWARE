import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/shared/auth/auth"
import { jobService } from "../services/job-service"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!job.archivedAt) return NextResponse.json({ error: "Job is not archived" }, { status: 409 })

    const restored = await jobService.restore(id, auth.user.id, auth.user.name)
    if (!restored) return NextResponse.json({ error: "Restore failed" }, { status: 500 })
    return NextResponse.json({ ok: true, job: restored })
  } catch (err) {
    console.error("[POST /api/jobs/[id]/restore]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
