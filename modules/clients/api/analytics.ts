/**
 * GET /api/clients/[id]/analytics
 */
import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { clientService } from "../services/client-service"
import { jobService } from "@/modules/jobs"

type Ctx = { params: Promise<{ id: string }> }

/** Minimal job shape for analytics — keep in sync with findAnalyticsFields. */
type AnalyticsJob = {
  status: string
  itemType: string
  quoteValue: number | null
  dateCreated: string
  dateCompleted: string | null
}

function computeAnalytics(jobs: AnalyticsJob[]) {
  const totalJobs = jobs.length
  const completed = jobs.filter(j => j.status === "ISSUED").length
  const inProgress = jobs.filter(j => j.status === "IN_DESIGN").length
  const checking = jobs.filter(j => j.status === "CHECKING").length
  const readyToSend = jobs.filter(j => j.status === "READY_TO_SEND").length
  const newRequest = jobs.filter(j => j.status === "NEW_REQUEST").length
  const completionRate = totalJobs > 0 ? Math.round((completed / totalJobs) * 100) : 0

  const designs = jobs.filter(j => j.itemType === "DESIGN" || !j.itemType).length
  const revisions = jobs.filter(j => j.itemType === "REVISION").length
  const siteVisits = jobs.filter(j => j.itemType === "SITE_VISIT").length
  const surveys = jobs.filter(j => j.itemType === "SURVEY").length
  const inspections = jobs.filter(j => j.itemType === "INSPECTION").length
  const catiiiDesignChecks = jobs.filter(j => j.itemType === "CATIII_DESIGN_CHECK").length

  const totalQuoted = jobs.reduce((sum, j) => sum + (j.quoteValue ?? 0), 0)
  const completedQuoted = jobs
    .filter(j => j.status === "ISSUED")
    .reduce((sum, j) => sum + (j.quoteValue ?? 0), 0)

  const completionTimes: number[] = []
  for (const j of jobs) {
    if (j.status === "ISSUED" && j.dateCompleted && j.dateCreated) {
      const created = new Date(j.dateCreated).getTime()
      const completedAt = new Date(j.dateCompleted).getTime()
      if (!isNaN(created) && !isNaN(completedAt) && completedAt >= created) {
        completionTimes.push(Math.ceil((completedAt - created) / 86_400_000))
      }
    }
  }
  const avgCompletionDays = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : null

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
    readyToSend,
    newRequest,
    completionRate,
    designs,
    revisions,
    siteVisits,
    surveys,
    inspections,
    catiiiDesignChecks,
    totalQuoted: Math.round(totalQuoted * 100) / 100,
    completedQuoted: Math.round(completedQuoted * 100) / 100,
    avgCompletionDays,
    timeline,
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const client = await clientService.findUnique(id)
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Perf: slim column fetch instead of full JobRow × up to 10k
    const jobs = await jobService.findAnalyticsFields({ clientId: id, take: 10000 })
    const analytics = computeAnalytics(jobs)

    return NextResponse.json(analytics)
  } catch (err) {
    return apiInternalError("clients.api.analytics", err)
  }
}
