/**
 * After a SITE_VISIT job is created, mirror it onto the calendar once.
 * Soft-fails so job creation still succeeds if calendar is unavailable.
 */

import { createId } from "@paralleldrive/cuid2"
import { calendarService } from "@/modules/calendar/services/calendar-service"
import { SITE_VISIT_CATEGORY_ID } from "@/modules/calendar"
import type { JobRow } from "../types/job-types"

export type SiteVisitSchedule = {
  /** YYYY-MM-DD */
  visitDate: string
  /** HH:mm */
  startTime: string
  /** HH:mm */
  endTime: string
}

export function parseSiteVisitSchedule(body: Record<string, unknown>): SiteVisitSchedule | null {
  const visitDate = typeof body.visitDate === "string" ? body.visitDate.trim() : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return null
  const startTime = typeof body.visitStartTime === "string" && /^\d{2}:\d{2}$/.test(body.visitStartTime.trim())
    ? body.visitStartTime.trim()
    : "09:00"
  let endTime = typeof body.visitEndTime === "string" && /^\d{2}:\d{2}$/.test(body.visitEndTime.trim())
    ? body.visitEndTime.trim()
    : "10:00"
  if (endTime <= startTime) {
    // Default to +1h when end is missing or before start
    const [h, m] = startTime.split(":").map(Number)
    const endH = Math.min(23, (h ?? 9) + 1)
    endTime = `${String(endH).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`
  }
  return { visitDate, startTime, endTime }
}

export function siteVisitEventTitle(job: Pick<JobRow, "drawingNumber" | "clientCompany" | "siteName">): string {
  const site = job.siteName?.trim()
  const client = job.clientCompany?.trim()
  if (site && client) return `Site visit — ${site} (${client})`
  if (site) return `Site visit — ${site}`
  if (client) return `Site visit — ${client}`
  return `Site visit — ${job.drawingNumber}`
}

/**
 * Create a linked calendar event for a newly created site-visit job.
 * Errors are logged; callers should not fail the job create response.
 */
export async function syncSiteVisitToCalendar(opts: {
  job: JobRow
  schedule: SiteVisitSchedule
  createdBy: string
}): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  const { job, schedule, createdBy } = opts
  const eventId = createId()
  const startDate = `${schedule.visitDate}T${schedule.startTime}:00`
  const endDate = `${schedule.visitDate}T${schedule.endTime}:00`
  const location = [job.siteName, job.siteAddress || job.address]
    .map(s => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ") || job.address || null

  try {
    await calendarService.create({
      id: eventId,
      title: siteVisitEventTitle(job),
      description: job.notes,
      categoryId: SITE_VISIT_CATEGORY_ID,
      startDate,
      endDate,
      allDay: 0,
      location,
      priority: "MEDIUM",
      status: "SCHEDULED",
      jobId: job.id,
      clientId: job.clientId,
      createdBy,
    })
    return { ok: true, eventId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn("[jobs.site-visit] calendar sync failed:", message)
    return { ok: false, error: message }
  }
}
