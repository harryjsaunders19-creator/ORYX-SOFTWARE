/**
 * Synthesize calendar events from engineering job deadlines so the calendar
 * surfaces operational work without duplicate data entry.
 *
 * Sources (non-archived, incomplete):
 * - Parent / revision required-by dates → Design Deadline or Revision Due
 * - Status CHECKING with a due date → CAT II / Checking
 * - SITE_VISIT item types with a due date → Site Visit (derived)
 */

import { createRequire } from "node:module"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { jobService } from "@/modules/jobs/services/job-service"
import { isActiveStatus } from "@/modules/jobs/lib/current-work"
import type { CalendarEventWithDetails } from "../types/calendar-types"
import { CATEGORY_COLOUR_DEFAULTS } from "../config/category-config"
import { makeJobDerivedEventId } from "../lib/job-derived-ids"

export { isJobDerivedEventId, jobIdFromDerivedEventId } from "../lib/job-derived-ids"

const require = createRequire(import.meta.url)

type SlimJob = {
  id: string
  drawingNumber: string
  parentJobId: string | null
  revisionLetter: string | null
  status: string
  requiredByDate: string | null
  clientCompany: string
  itemType: string
  clientId: string | null
}

function dayOnly(value: string | null | undefined): string | null {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : value
}

function classify(job: SlimJob): {
  categoryId: string
  title: string
  kind: string
} | null {
  const due = dayOnly(job.requiredByDate)
  if (!due) return null
  if (!isActiveStatus(job.status)) return null

  const drawing = job.drawingNumber || "Job"
  const rev = job.revisionLetter?.trim()
  const revLabel = rev
    ? (rev.toUpperCase().startsWith("REV") ? rev.toUpperCase() : `Rev ${rev.toUpperCase()}`)
    : null

  if (job.itemType === "SITE_VISIT") {
    return {
      categoryId: "cat_site_visit",
      kind: "site-visit",
      title: `${drawing} — Site visit`,
    }
  }

  if (job.status === "CHECKING") {
    return {
      categoryId: "cat_checking_due",
      kind: "checking",
      title: revLabel
        ? `${drawing} ${revLabel} — CAT II / Checking`
        : `${drawing} — CAT II / Checking`,
    }
  }

  if (job.parentJobId || revLabel) {
    return {
      categoryId: "cat_revision_due",
      kind: "revision",
      title: revLabel
        ? `${drawing} ${revLabel} — Revision due`
        : `${drawing} — Revision due`,
    }
  }

  return {
    categoryId: "cat_deadline",
    kind: "deadline",
    title: `${drawing} — Design deadline`,
  }
}

function toEvent(job: SlimJob, from: string, to: string): CalendarEventWithDetails | null {
  const due = dayOnly(job.requiredByDate)
  if (!due || due < from || due > to) return null
  const classified = classify(job)
  if (!classified) return null

  const colour = CATEGORY_COLOUR_DEFAULTS[classified.categoryId]?.color ?? "#B86A2E"
  const name = CATEGORY_COLOUR_DEFAULTS[classified.categoryId]?.name ?? "Deadline"
  const parentOrSelf = job.parentJobId ?? job.id
  const now = new Date().toISOString()

  return {
    id: makeJobDerivedEventId(classified.kind, job.id),
    title: classified.title,
    description: job.clientCompany
      ? `Linked job deadline · ${job.clientCompany}`
      : "Linked job deadline",
    categoryId: classified.categoryId,
    startDate: `${due}T09:00:00.000Z`,
    endDate: `${due}T17:00:00.000Z`,
    allDay: 1,
    location: null,
    priority: job.status === "CHECKING" ? "HIGH" : "MEDIUM",
    status: "SCHEDULED",
    jobId: parentOrSelf,
    clientId: job.clientId,
    createdBy: "system",
    createdAt: now,
    updatedAt: now,
    categoryName: name,
    categoryColor: colour,
    assignees: [],
    jobDrawingNumber: job.drawingNumber,
    clientName: job.clientCompany || null,
    createdByName: "ORYX",
  }
}

async function loadSlimJobsSupabase(from: string, to: string): Promise<SlimJob[]> {
  const { createAdminClient } = require("@/shared/supabase/admin") as typeof import("@/shared/supabase/admin")
  const { jobsArchivedFilterEnabled } = require("@/shared/supabase/archived-filter") as typeof import("@/shared/supabase/archived-filter")

  const pageSize = 1000
  let useArchived = jobsArchivedFilterEnabled()
  const cols =
    "id, drawing_number, parent_job_id, revision_letter, status, required_by_date, client_company, item_type, client_id"

  const fetchPage = async (offset: number, archived: boolean) => {
    let q = createAdminClient()
      .from("jobs")
      .select(cols)
      .not("required_by_date", "is", null)
      .gte("required_by_date", from)
      .lte("required_by_date", to)
      .neq("status", "ISSUED")
      .range(offset, offset + pageSize - 1)
    if (archived) q = q.is("archived_at", null)
    return q
  }

  let { data, error } = await fetchPage(0, useArchived)
  if (error && /archived_at/i.test(error.message ?? "")) {
    useArchived = false
    ;({ data, error } = await fetchPage(0, false))
  }
  if (error) throw error

  const rows = [...(data ?? [])]
  while ((data?.length ?? 0) === pageSize) {
    ;({ data, error } = await fetchPage(rows.length, useArchived))
    if (error) throw error
    rows.push(...(data ?? []))
  }

  return rows.map(r => ({
    id: r.id as string,
    drawingNumber: (r.drawing_number as string) ?? "",
    parentJobId: (r.parent_job_id as string | null) ?? null,
    revisionLetter: (r.revision_letter as string | null) ?? null,
    status: r.status as string,
    requiredByDate: (r.required_by_date as string | null) ?? null,
    clientCompany: (r.client_company as string) ?? "",
    itemType: (r.item_type as string) ?? "DESIGN",
    clientId: (r.client_id as string | null) ?? null,
  }))
}

async function loadSlimJobsSqlite(from: string, to: string): Promise<SlimJob[]> {
  const jobs = await jobService.findMany({
    where: { hasDeadline: true },
    take: 5_000,
  })
  return jobs
    .filter(j => {
      const due = dayOnly(j.requiredByDate)
      if (!due || due < from || due > to) return false
      return isActiveStatus(j.status)
    })
    .map(j => ({
      id: j.id,
      drawingNumber: j.drawingNumber ?? "",
      parentJobId: j.parentJobId ?? null,
      revisionLetter: j.revisionLetter ?? null,
      status: j.status,
      requiredByDate: j.requiredByDate,
      clientCompany: j.clientCompany ?? "",
      itemType: j.itemType ?? "DESIGN",
      clientId: j.clientId ?? null,
    }))
}

/**
 * Job-derived calendar events for [from, to] (inclusive day keys).
 * Failures are swallowed by the caller so calendar events still load.
 */
export async function findJobDerivedCalendarEvents(
  from: string,
  to: string,
): Promise<CalendarEventWithDetails[]> {
  const slim = isSupabaseOnly()
    ? await loadSlimJobsSupabase(from, to)
    : await loadSlimJobsSqlite(from, to)

  const out: CalendarEventWithDetails[] = []
  for (const job of slim) {
    const ev = toEvent(job, from, to)
    if (ev) out.push(ev)
  }
  return out
}
