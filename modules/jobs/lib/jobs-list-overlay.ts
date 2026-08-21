/**
 * Jobs Register list overlay — current-work display fields on parent rows.
 *
 * Behaviour must stay aligned with:
 * - modules/jobs/lib/current-work.ts (scope / active rules)
 * - supabase/migrations/046_jobs_list_scoped_page.sql (paged RPC)
 * - flagRevisions historically inlined in modules/jobs/api/list.ts
 *
 * Current work priority for an original (parent) row:
 * 1. Latest active (non-ISSUED) revision by revision-letter rank, then updatedAt
 * 2. Else the original when still active (non-ISSUED)
 * 3. Else none (parent display fields; currentWorkType = "none")
 *
 * Revision rows (parentJobId set) keep their own fields; type is revision|none
 * from their own status only.
 *
 * Designer / deadline / quoteValue on the current revision use nullish coalesce
 * back to the parent (`??`), so empty-string designer on a revision is kept.
 */

import { compareRevisionLetters, enrichRevisionFamily } from "@/lib/revision-chain"
import { isActiveStatus } from "./current-work"
import { addDaysToIsoDate, todayIsoDate } from "@/shared/utils/utils"

export type JobsListOverlayJob = {
  id: string
  parentJobId: string | null
  revisionLetter?: string | null
  status?: string
  designer?: string
  requiredByDate?: string | null
  updatedAt?: string
  dateCompleted?: string | null
  quoteValue?: number | null
}

export type JobsListOverlayRevision = {
  id: string
  parentJobId: string | null
  revisionLetter?: string | null
  status?: string
  designer?: string | null
  requiredByDate?: string | null
  updatedAt?: string
  dateCompleted?: string | null
  quoteValue?: number | null
}

export type JobsListOverlayResult<T extends JobsListOverlayJob> =
  ReturnType<typeof enrichRevisionFamily<T>>[number] & {
    currentStatus?: string
    currentDesigner?: string
    currentRequiredByDate?: string | null
    currentQuoteValue?: number | null
    currentWorkType?: "original" | "revision" | "none"
  }

/**
 * Attach revision-family flags and *display* current-work fields without
 * overwriting the parent job's own status / designer / deadline columns.
 */
export function flagRevisions<T extends JobsListOverlayJob>(
  pageJobs: T[],
  revisionRows?: JobsListOverlayRevision[],
): Array<JobsListOverlayResult<T>> {
  const source = revisionRows ?? pageJobs.filter(j => j.parentJobId !== null)
  const enriched = enrichRevisionFamily(pageJobs, source)
  const byParent = new Map<string, typeof source>()
  for (const r of source) {
    if (!r.parentJobId) continue
    const list = byParent.get(r.parentJobId) ?? []
    list.push(r)
    byParent.set(r.parentJobId, list)
  }

  return enriched.map(job => {
    if (job.parentJobId !== null) {
      return {
        ...job,
        currentStatus: job.status,
        currentDesigner: job.designer,
        currentRequiredByDate: job.requiredByDate ?? null,
        currentQuoteValue: job.quoteValue ?? null,
        currentWorkType: isActiveStatus(job.status) ? "revision" : "none",
      }
    }

    const revs = byParent.get(job.id) ?? []
    const activeRevs = revs.filter(r => isActiveStatus(r.status))
    let current: (typeof source)[number] | null = null
    if (activeRevs.length > 0) {
      current = [...activeRevs].sort((a, b) => {
        const byLetter = compareRevisionLetters(a.revisionLetter, b.revisionLetter)
        if (byLetter !== 0) return byLetter
        return String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""))
      }).at(-1) ?? null
    }

    if (current) {
      return {
        ...job,
        currentRevisionId: current.id,
        currentRevisionLetter: current.revisionLetter ?? null,
        currentStatus: current.status ?? job.status,
        currentDesigner: current.designer ?? job.designer,
        currentRequiredByDate: current.requiredByDate ?? job.requiredByDate ?? null,
        currentQuoteValue: current.quoteValue ?? job.quoteValue ?? null,
        currentWorkType: "revision" as const,
      }
    }

    if (isActiveStatus(job.status)) {
      return {
        ...job,
        currentStatus: job.status,
        currentDesigner: job.designer,
        currentRequiredByDate: job.requiredByDate ?? null,
        currentQuoteValue: job.quoteValue ?? null,
        currentWorkType: "original" as const,
      }
    }

    return {
      ...job,
      currentStatus: job.status,
      currentDesigner: job.designer,
      currentRequiredByDate: job.requiredByDate ?? null,
      currentQuoteValue: job.quoteValue ?? null,
      currentWorkType: "none" as const,
    }
  })
}

function weekStartIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return addDaysToIsoDate(d, mondayOffset)
}

function weekEndIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const sundayOffset = dow === 0 ? 0 : 7 - dow
  return addDaysToIsoDate(d, sundayOffset)
}

/** Calendar anchors used by deadline filters on the Jobs list overlay. */
export function jobsListDeadlineAnchors(now = new Date()): {
  today: string
  weekStart: string
  weekEnd: string
} {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  const sundayOffset = dow === 0 ? 0 : 7 - dow
  return {
    today: todayIsoDate(),
    weekStart: addDaysToIsoDate(d, mondayOffset),
    weekEnd: addDaysToIsoDate(d, sundayOffset),
  }
}

/** Filter parent rows by their *current revision* display fields. */
export function filterByCurrentDisplay<T extends {
  status: string
  designer?: string
  requiredByDate?: string | null
  parentJobId: string | null
  currentStatus?: string
  currentDesigner?: string
  currentRequiredByDate?: string | null
}>(
  jobs: T[],
  opts: {
    status?: string
    unassigned?: boolean
    overdue?: boolean
    dueToday?: boolean
    dueThisWeek?: boolean
    today?: string
    weekStart?: string
    weekEnd?: string
  },
): T[] {
  const today = opts.today ?? todayIsoDate()
  const wkStart = opts.weekStart ?? weekStartIso()
  const wkEnd = opts.weekEnd ?? weekEndIso()
  return jobs.filter(j => {
    const status = j.currentStatus ?? j.status
    const designer = j.currentDesigner ?? j.designer
    const due = j.currentRequiredByDate ?? j.requiredByDate
    if (opts.status && status !== opts.status) return false
    if (opts.unassigned && (designer ?? "").trim() !== "") return false
    if (status === "ISSUED") {
      if (opts.overdue || opts.dueToday || opts.dueThisWeek) return false
    }
    if (opts.overdue && !(due != null && due < today)) return false
    if (opts.dueToday && due !== today) return false
    if (opts.dueThisWeek && !(due != null && due >= wkStart && due <= wkEnd)) return false
    return true
  })
}
