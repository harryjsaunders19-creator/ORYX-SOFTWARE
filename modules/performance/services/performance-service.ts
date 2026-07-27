/**
 * Aggregate designer performance from Users-tab people + classic jobs.
 *
 * Leaderboard =
 *   1. Every person in `/users` (Admin and Engineer — never role-filtered)
 *   2. Plus any job.designer name that doesn't match a user (so free-text
 *      names like "Harry" still appear even when the Users name differs)
 *
 * Job attribution tries, in order:
 *   - exact name (case-insensitive, whitespace-collapsed)
 *   - unique first name ("Harry" → "Harry Saunders" when only one Harry)
 *   - unique email local-part ("harry" → harry@oryxdesignltd.co.uk)
 *   - otherwise a synthetic row keyed by the designer text itself
 *
 * Completed-in-period uses dateCompleted, falling back to updatedAt when
 * ISSUED jobs were never stamped with a completion date.
 */
import { jobService } from "@/modules/jobs"
import { userService } from "@/modules/users"
import type {
  PerformanceEmployeeRow,
  PerformancePayload,
  PerformancePeriod,
  PerformanceRole,
} from "../types"

const IN_PROGRESS = new Set([
  "NEW_REQUEST",
  "IN_DESIGN",
  "CHECKING",
  "READY_TO_SEND",
])

export interface PerformanceJobInput {
  designer: string
  status: string
  dateCompleted: string | null
  requiredByDate: string | null
  updatedAt?: string | null
}

export interface PerformanceUserInput {
  id: string
  name: string
  role?: string | null
  email?: string | null
  emailLower?: string | null
  active?: number
}

function dayPart(iso: string | null | undefined): string | null {
  if (!iso) return null
  return iso.length >= 10 ? iso.slice(0, 10) : iso
}

/** Collapse internal whitespace and lower-case for stable name keys. */
export function normalizeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

function firstNameKey(name: string): string {
  const full = normalizeKey(name)
  if (!full) return ""
  return full.split(" ")[0] ?? ""
}

function emailLocalKey(email: string | null | undefined): string {
  if (!email) return ""
  const lower = email.trim().toLowerCase()
  const at = lower.indexOf("@")
  if (at <= 0) return ""
  return lower.slice(0, at)
}

/** Normalize any Users-tab role string to ADMIN | ENGINEER. */
export function normalizeRole(role: string | null | undefined): PerformanceRole {
  return String(role ?? "").trim().toUpperCase() === "ADMIN" ? "ADMIN" : "ENGINEER"
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

type AccRow = {
  userId: string
  name: string
  role: PerformanceRole
  fromDirectory: boolean
  completedInPeriod: number
  completedAllTime: number
  inProgress: number
  awaitingChecking: number
  overdue: number
  lastCompletedAt: string | null
}

function emptyRow(
  userId: string,
  name: string,
  role: PerformanceRole,
  fromDirectory: boolean,
): AccRow {
  return {
    userId,
    name,
    role,
    fromDirectory,
    completedInPeriod: 0,
    completedAllTime: 0,
    inProgress: 0,
    awaitingChecking: 0,
    overdue: 0,
    lastCompletedAt: null,
  }
}

/** Mark a lookup key as unique → fullNameKey, or "" when ambiguous. */
function rememberUnique(index: Map<string, string>, alias: string, fullKey: string) {
  if (!alias) return
  if (index.has(alias) && index.get(alias) !== fullKey) {
    index.set(alias, "")
  } else if (!index.has(alias)) {
    index.set(alias, fullKey)
  }
}

/**
 * Pure aggregation — seed Users-tab people, attribute jobs, and keep any
 * unmatched designer names visible. Exported for unit tests.
 */
export function aggregatePerformance(opts: {
  users: PerformanceUserInput[]
  jobs: PerformanceJobInput[]
  period: PerformancePeriod
  today?: string
}): PerformancePayload {
  const weeks = weeksInPeriod(opts.period.from, opts.period.to)
  const today = opts.today ?? todayIsoDate()

  const byName = new Map<string, AccRow>()
  const firstNameIndex = new Map<string, string>()
  const emailLocalIndex = new Map<string, string>()

  for (const u of opts.users) {
    const display = u.name.trim().replace(/\s+/g, " ")
    if (!display) continue
    const key = normalizeKey(display)
    const role = normalizeRole(u.role)
    // Prefer the first user when duplicate names exist (stable, deterministic).
    // Never skip based on role — Admins design jobs too.
    if (!byName.has(key)) {
      byName.set(key, emptyRow(u.id, display, role, true))
    }
    rememberUnique(firstNameIndex, firstNameKey(display), key)
    rememberUnique(
      emailLocalIndex,
      emailLocalKey(u.emailLower ?? u.email),
      key,
    )
  }

  function resolveOrCreateRow(designerRaw: string): AccRow | null {
    const key = normalizeKey(designerRaw)
    if (!key) return null

    const exact = byName.get(key)
    if (exact) return exact

    const first = firstNameKey(designerRaw)
    const byFirst = first ? firstNameIndex.get(first) : undefined
    if (byFirst) {
      const row = byName.get(byFirst)
      if (row) return row
    }

    const byEmail = emailLocalIndex.get(key)
    if (byEmail) {
      const row = byName.get(byEmail)
      if (row) return row
    }

    // Keep free-text designers visible (e.g. historical "Harry" on jobs).
    const display = designerRaw.trim().replace(/\s+/g, " ")
    const synthetic = emptyRow(`designer:${key}`, display, "ENGINEER", false)
    byName.set(key, synthetic)
    return synthetic
  }

  for (const job of opts.jobs) {
    const row = resolveOrCreateRow(job.designer)
    if (!row) continue

    const completedDay = dayPart(job.dateCompleted) ?? dayPart(job.updatedAt)
    if (job.status === "ISSUED") {
      row.completedAllTime += 1
      if (completedDay && completedDay >= opts.period.from && completedDay <= opts.period.to) {
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
      role: r.role,
      fromDirectory: r.fromDirectory,
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
  // Counts only Users-directory people (not synthetic designer-only rows).
  const directory = [...byName.values()].filter(r => r.fromDirectory)
  const adminUsers = directory.filter(e => e.role === "ADMIN").length
  const engineerUsers = directory.filter(e => e.role === "ENGINEER").length

  return {
    period: opts.period,
    overview: {
      completedInPeriod,
      inProgress,
      avgCompletedPerWeek: Math.round((completedInPeriod / weeks) * 100) / 100,
      activeDesigners,
      awaitingChecking,
      overdue,
      totalUsers: directory.length,
      adminUsers,
      engineerUsers,
    },
    employees,
  }
}

export async function buildPerformancePayload(
  period: PerformancePeriod,
): Promise<PerformancePayload> {
  // Same directory as the Users page — every person, Admin and Engineer.
  // Do not pass activeOnly and do not filter by role.
  const [users, jobs] = await Promise.all([
    userService.findMany(),
    jobService.findPerformanceFields(),
  ])

  return aggregatePerformance({ users, jobs, period })
}
