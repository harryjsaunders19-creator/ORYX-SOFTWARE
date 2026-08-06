/**
 * Deadline tallies aligned with dashboard “current revision” semantics.
 *
 * Dashboard overdue / active KPIs use the latest revision’s status and
 * required-by date overlaid onto each original. The Job List no longer
 * overlays those fields onto parent cards (parents own their own status);
 * list filters therefore apply in SQL on parent columns.
 */
import { buildRevisionFamilyIndex, type RevisionChainRow } from "@/lib/revision-chain"
import { isRevisionActive } from "@/modules/jobs/lib/current-work"
import { addDaysToIsoDate, todayIsoDate } from "@/shared/utils/utils"

export type DeadlineTallyRow = {
  id: string
  parentJobId: string | null
  revisionLetter?: string | null
  status: string
  requiredByDate: string | null
}

export type DeadlineTallies = {
  overdueCount: number
  dueTodayCount: number
  dueThisWeekCount: number
}

/** Statuses that count as “active” on the dashboard KPI (New Request / In Progress). */
export const DASHBOARD_ACTIVE_STATUSES = new Set([
  "NEW_REQUEST",
  "IN_DESIGN",
])

/**
 * @deprecated Prefer {@link isRevisionActive} — kept for call sites that need a Set.
 * Active = any status except Complete (ISSUED), including READY_TO_SEND.
 */
export const DASHBOARD_ACTIVE_REVISION_STATUSES = new Set([
  "NEW_REQUEST",
  "IN_DESIGN",
  "CHECKING",
  "READY_TO_SEND",
])

function dayOnly(value: string | null | undefined): string | null {
  if (!value) return null
  return value.length >= 10 ? value.slice(0, 10) : value
}

function addDaysToIso(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number)
  return addDaysToIsoDate(new Date(y, m - 1, d), days)
}

/** Effective status + deadline for each original (parent) job. */
export function displayDeadlineByOriginal(
  rows: DeadlineTallyRow[],
): Map<string, { status: string; requiredByDate: string | null }> {
  const chainRows: RevisionChainRow[] = rows.map(r => ({
    id: r.id,
    parentJobId: r.parentJobId,
    revisionLetter: r.revisionLetter ?? null,
    status: r.status,
    requiredByDate: r.requiredByDate,
  }))
  const { latestByParent } = buildRevisionFamilyIndex(chainRows)
  const out = new Map<string, { status: string; requiredByDate: string | null }>()

  for (const row of rows) {
    if (row.parentJobId != null) continue
    const latest = latestByParent.get(row.id)
    out.set(row.id, {
      status: latest?.status ?? row.status,
      requiredByDate: dayOnly(
        latest?.requiredByDate !== undefined && latest?.requiredByDate !== null
          ? latest.requiredByDate
          : row.requiredByDate,
      ),
    })
  }
  return out
}

/** Count overdue / due-today / due-this-week using current-revision display fields. */
export function tallyDeadlineStats(
  rows: DeadlineTallyRow[],
  today: string = todayIsoDate(),
): DeadlineTallies {
  const weekEnd = addDaysToIso(today, 7)
  const display = displayDeadlineByOriginal(rows)
  let overdueCount = 0
  let dueTodayCount = 0
  let dueThisWeekCount = 0

  for (const { status, requiredByDate } of display.values()) {
    if (status === "ISSUED" || !requiredByDate) continue
    if (requiredByDate < today) overdueCount += 1
    if (requiredByDate === today) dueTodayCount += 1
    if (requiredByDate >= today && requiredByDate <= weekEnd) dueThisWeekCount += 1
  }

  return { overdueCount, dueTodayCount, dueThisWeekCount }
}

/**
 * Original jobs whose current-revision display status is New Request or In Progress.
 * Requires Checking, Ready to Send, and Complete are excluded — checking has its
 * own KPI, and completed work must not inflate “active jobs”.
 */
export function countActiveOriginalJobs(rows: DeadlineTallyRow[]): number {
  const display = displayDeadlineByOriginal(rows)
  let n = 0
  for (const { status } of display.values()) {
    if (DASHBOARD_ACTIVE_STATUSES.has(status)) n += 1
  }
  return n
}

/** Revision rows (not originals) that still need completing. */
export function countActiveRevisions(rows: DeadlineTallyRow[]): number {
  let n = 0
  for (const row of rows) {
    if (row.parentJobId == null) continue
    if (isRevisionActive(row)) n += 1
  }
  return n
}

/** Original ids whose current-revision display is overdue (not ISSUED). */
export function overdueOriginalIds(
  rows: DeadlineTallyRow[],
  today: string = todayIsoDate(),
): string[] {
  const display = displayDeadlineByOriginal(rows)
  const ids: string[] = []
  for (const [id, { status, requiredByDate }] of display) {
    if (status === "ISSUED" || !requiredByDate) continue
    if (requiredByDate < today) ids.push(id)
  }
  return ids
}
