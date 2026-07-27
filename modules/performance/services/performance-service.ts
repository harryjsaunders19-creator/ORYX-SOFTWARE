/**
 * Aggregate designer performance from active users (all roles) + classic jobs.
 * Jobs are attributed when lower(trim(jobs.designer)) === lower(trim(user.name)).
 */
import { jobService } from "@/modules/jobs"
import { userService } from "@/modules/users"
import type {
  PerformanceEmployeeRow,
  PerformancePayload,
  PerformancePeriod,
} from "../types"

const IN_PROGRESS = new Set([
  "NEW_REQUEST",
  "IN_DESIGN",
  "CHECKING",
  "READY_TO_SEND",
])

function dayPart(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.length >= 10 ? iso.slice(0, 10) : iso
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase()
}

function weeksInPeriod(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00.000Z`)
  const toMs = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return 1
  const days = Math.floor((toMs - fromMs) / 86_400_000) + 1
  return Math.max(1, days / 7)
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function defaultPeriod(): PerformancePeriod {
  const to = todayIsoDate()
  const from = `${to.slice(0, 7)}-01`
  return { from, to }
}

function parseIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const d = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return d
}

export function resolvePerformancePeriod(
  fromParam?: string | null,
  toParam?: string | null,
): PerformancePeriod {
  const fallback = defaultPeriod()
  const from = parseIsoDate(fromParam) ?? fallback.from
  const to = parseIsoDate(toParam) ?? fallback.to
  if (to < from) return { from: to, to: from }
  return { from, to }
}

export async function buildPerformancePayload(
  period: PerformancePeriod,
): Promise<PerformancePayload> {
  const weeks = weeksInPeriod(period.from, period.to)
  const today = todayIsoDate()

  const [users, jobs] = await Promise.all([
    userService.findMany({ activeOnly: true }),
    jobService.findPerformanceFields(),
  ])

  const byName = new Map<string, {
    userId: string
    name: string
    completedInPeriod: number
    completedAllTime: number
    inProgress: number
    awaitingChecking: number
    overdue: number
    lastCompletedAt: string | null
  }>()

  for (const u of users) {
    byName.set(normalizeKey(u.name), {
      userId: u.id,
      name: u.name,
      completedInPeriod: 0,
      completedAllTime: 0,
      inProgress: 0,
      awaitingChecking: 0,
      overdue: 0,
      lastCompletedAt: null,
    })
  }

  for (const job of jobs) {
    const key = normalizeKey(job.designer)
    if (!key) continue
    const row = byName.get(key)
    if (!row) continue

    const completedDay = dayPart(job.dateCompleted)
    if (job.status === "ISSUED") {
      row.completedAllTime += 1
      if (completedDay && completedDay >= period.from && completedDay <= period.to) {
        row.completedInPeriod += 1
      }
      if (completedDay && (!row.lastCompletedAt || completedDay > row.lastCompletedAt)) {
        row.lastCompletedAt = completedDay
      }
    }

    if (IN_PROGRESS.has(job.status)) {
      row.inProgress += 1
      if (job.status === "CHECKING") row.awaitingChecking += 1
      const due = dayPart(job.requiredByDate)
      if (due && due < today) row.overdue += 1
    }
  }

  const employees: PerformanceEmployeeRow[] = [...byName.values()]
    .map(r => ({
      userId: r.userId,
      name: r.name,
      completedInPeriod: r.completedInPeriod,
      completedAllTime: r.completedAllTime,
      avgPerWeek: Math.round((r.completedInPeriod / weeks) * 100) / 100,
      inProgress: r.inProgress,
      awaitingChecking: r.awaitingChecking,
      overdue: r.overdue,
      lastCompletedAt: r.lastCompletedAt,
    }))
    .sort((a, b) =>
      b.completedInPeriod - a.completedInPeriod
      || a.name.localeCompare(b.name),
    )

  const completedInPeriod = employees.reduce((n, e) => n + e.completedInPeriod, 0)
  const inProgress = employees.reduce((n, e) => n + e.inProgress, 0)
  const awaitingChecking = employees.reduce((n, e) => n + e.awaitingChecking, 0)
  const overdue = employees.reduce((n, e) => n + e.overdue, 0)
  const activeDesigners = employees.filter(e => e.inProgress > 0).length

  return {
    period,
    overview: {
      completedInPeriod,
      inProgress,
      avgCompletedPerWeek: Math.round((completedInPeriod / weeks) * 100) / 100,
      activeDesigners,
      awaitingChecking,
      overdue,
    },
    employees,
  }
}
