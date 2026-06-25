/**
 * GET /api/clients/[id]/analytics
 *
 * Admin-only endpoint returning detailed analytics for a single client:
 * completion rate, job breakdown by status, monthly job timeline, and
 * average completion time.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { clientDb, jobDb } from "@/lib/db"
import type { JobRow } from "@/lib/db"

type Ctx = { params: Promise<{ id: string }> }

function computeAnalytics(jobs: JobRow[]) {
  const totalJobs = jobs.length
  const completed = jobs.filter(j => j.status === "ISSUED").length
  const inProgress = jobs.filter(j => j.status === "IN_DESIGN").length
  const checking = jobs.filter(j => j.status === "CHECKING").length
  const newRequest = jobs.filter(j => j.status === "NEW_REQUEST").length
  const completionRate = totalJobs > 0 ? Math.round((completed / totalJobs) * 100) : 0

  const designs = jobs.filter(j => j.itemType === "DESIGN" || !j.itemType).length
  const revisions = jobs.filter(j => j.itemType === "REVISION").length
  const siteVisits = jobs.filter(j => j.itemType === "SITE_VISIT").length
  const surveys = jobs.filter(j => j.itemType === "SURVEY").length
  const inspections = jobs.filter(j => j.itemType === "INSPECTION").length

  const totalQuoted = jobs.reduce((sum, j) => sum + (j.quoteValue ?? 0), 0)
  const completedQuoted = jobs
    .filter(j => j.status === "ISSUED")
    .reduce((sum, j) => sum + (j.quoteValue ?? 0), 0)

  // Average completion time (days) for jobs that have both created and completed dates
  const completionTimes: number[] = []
  for (const j of jobs) {
    if (j.status === "ISSUED" && j.dateCompleted && j.dateCreated) {
      const created = new Date(j.dateCreated).getTime()
      const completed = new Date(j.dateCompleted).getTime()
      if (!isNaN(created) && !isNaN(completed) && completed >= created) {
        completionTimes.push(Math.ceil((completed - created) / 86_400_000))
      }
    }
  }
  const avgCompletionDays = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : null

  // Monthly timeline (last 12 months)
  const now = new Date()
  const timeline: { month: string; created: number; completed: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
    const created = jobs.filter(j => j.dateCreated?.startsWith(key)).length
    const completedInMonth = jobs.filter(j => j.dateCompleted?.startsWith(key)).length
    timeline.push({ month: label, created, completed: completedInMonth })
  }

  return {
    totalJobs,
    completed,
    inProgress,
    checking,
    newRequest,
    completionRate,
    designs,
    revisions,
    siteVisits,
    surveys,
    inspections,
    totalQuoted: Math.round(totalQuoted * 100) / 100,
    completedQuoted: Math.round(completedQuoted * 100) / 100,
    avgCompletionDays,
    timeline,
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const client = clientDb.findUnique(id)
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const jobs = clientDb.jobsForClient(id, 10000)
    const analytics = computeAnalytics(jobs)

    return NextResponse.json(analytics)
  } catch (err) {
    console.error("[GET /api/clients/[id]/analytics]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
