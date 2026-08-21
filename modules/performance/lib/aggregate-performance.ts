/**
 * Pure Performance aggregation — golden reference for KPI parity.
 *
 * No I/O. Supabase SQL RPC and SQLite/slim paths must match this output
 * for identical inputs (aside from `jobs` omission on the SQL page path).
 */
import { JOB_STATUSES, WORK_ITEM_TYPES } from "@/lib/constants"
import { coerceRole } from "@/shared/types/role"
import type {
  ChartPoint,
  FilterOptions,
  KpiMetric,
  PerformanceClientRow,
  PerformanceEngineerRow,
  PerformanceFilters,
  PerformanceJobRow,
  PerformancePayload,
  PerformancePeriod,
  PerformanceRole,
  StatusBreakdownRow,
  TimeAnalytics,
  TrendDirection,
  WorkloadAnalytics,
} from "../types"

export const PERFORMANCE_DEFAULT_FILTER = "all"
const DAY_MS = 86_400_000
export const PERFORMANCE_ACTIVE_STATUSES = new Set([
  "NEW_REQUEST",
  "IN_DESIGN",
  "CHECKING",
  "READY_TO_SEND",
])
const AWAITING_CHECKING = "CHECKING"
const AWAITING_CLIENT_INFORMATION = "READY_TO_SEND"
const COMPLETE_STATUS = "ISSUED"

export type PerformanceRawJob = {
  id: string
  drawingNumber: string
  clientId: string | null
  clientCompany: string
  designer: string
  status: string
  itemType: string
  tags: string[]
  dateCreated: string
  dateCompleted: string | null
  requiredByDate: string | null
  requestedDate: string | null
  parentJobId: string | null
}

export type PerformanceRawClient = { id: string; name: string; createdAt: string; active: number }
export type PerformanceRawUser = { id: string; name: string; role: string; active: number }

type AggregateContext = {
  jobsInPeriod: PerformanceJobRow[]
  jobsPrevPeriod: PerformanceJobRow[]
  jobsAll: PerformanceJobRow[]
  clients: PerformanceRawClient[]
  users: PerformanceRawUser[]
  period: PerformancePeriod
  previousPeriod: { from: string; to: string }
}

export function normalizeRole(role: string | null | undefined): PerformanceRole {
  return coerceRole(role)
}

export function normalizeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

export function daysBetween(start: string, end: string): number {
  const fromMs = Date.parse(`${start}T00:00:00.000Z`)
  const toMs = Date.parse(`${end}T00:00:00.000Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0
  return Math.max(0, Math.round((toMs - fromMs) / DAY_MS))
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function trendFromDelta(delta: number): TrendDirection {
  if (delta > 0) return "up"
  if (delta < 0) return "down"
  return "flat"
}

function kpi(key: string, label: string, value: number, previousValue: number): KpiMetric {
  const delta = value - previousValue
  const deltaPct = previousValue === 0 ? null : round2((delta / previousValue) * 100)
  return { key, label, value, previousValue, delta, deltaPct, trend: trendFromDelta(delta) }
}

function toWeekLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`)
  const weekStart = new Date(d)
  weekStart.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return weekStart.toISOString().slice(0, 10)
}

function getMonthLabel(dateIso: string): string {
  return dateIso.slice(0, 7)
}

export function dateRangeDays(from: string, to: string): string[] {
  const out: string[] = []
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out
  for (let t = start; t <= end; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export function dateRangeMonths(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  while (cursor <= endMonth) {
    out.push(cursor.toISOString().slice(0, 7))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return out
}

export function dateRangeWeeks(from: string, to: string): string[] {
  const days = dateRangeDays(from, to)
  return [...new Set(days.map(toWeekLabel))]
}

export function inRange(day: string | null, from: string, to: string): boolean {
  return !!day && day >= from && day <= to
}

export function getPreviousPeriod(period: PerformancePeriod): { from: string; to: string } {
  const spanDays = daysBetween(period.from, period.to) + 1
  const prevToMs = Date.parse(`${period.from}T00:00:00.000Z`) - DAY_MS
  const prevFromMs = prevToMs - (spanDays - 1) * DAY_MS
  return {
    from: new Date(prevFromMs).toISOString().slice(0, 10),
    to: new Date(prevToMs).toISOString().slice(0, 10),
  }
}

function buildStatusBreakdown(jobs: PerformanceJobRow[]): StatusBreakdownRow[] {
  const counts = new Map<string, number>()
  for (const job of jobs) counts.set(job.status, (counts.get(job.status) ?? 0) + 1)
  const known = JOB_STATUSES.map(s => ({
    status: s.value,
    label: s.label,
    count: counts.get(s.value) ?? 0,
  }))
  const unknown = [...counts.entries()]
    .filter(([status]) => !JOB_STATUSES.some(s => s.value === status))
    .map(([status, count]) => ({ status, label: status, count }))
  return [...known, ...unknown]
}

function buildSeries(
  buckets: string[],
  jobs: PerformanceJobRow[],
  by: "month" | "week" | "day",
): ChartPoint[] {
  const createdCounts = new Map<string, number>()
  const completedCounts = new Map<string, number>()
  const keyFor = (day: string, mode: "month" | "week" | "day") => {
    if (mode === "month") return getMonthLabel(day)
    if (mode === "week") return toWeekLabel(day)
    return day
  }
  for (const job of jobs) {
    const createdDay = job.createdDate
    const createdKey = keyFor(createdDay, by)
    createdCounts.set(createdKey, (createdCounts.get(createdKey) ?? 0) + 1)
    const completedDay = job.completedDate
    if (completedDay) {
      const completedKey = keyFor(completedDay, by)
      completedCounts.set(completedKey, (completedCounts.get(completedKey) ?? 0) + 1)
    }
  }
  return buckets.map(bucket => ({
    key: bucket,
    label: bucket,
    value: createdCounts.get(bucket) ?? 0,
    valueB: completedCounts.get(bucket) ?? 0,
  }))
}

function buildEngineerRows(ctx: AggregateContext): PerformanceEngineerRow[] {
  const usersByName = new Map<string, PerformanceRawUser>()
  for (const user of ctx.users) usersByName.set(user.name.trim().toLowerCase(), user)
  const seed = new Map<string, PerformanceEngineerRow>()
  for (const user of ctx.users) {
    seed.set(user.id, {
      userId: user.id,
      name: user.name,
      role: normalizeRole(user.role),
      fromDirectory: true,
      jobsCompleted: 0,
      jobsAssigned: 0,
      avgTurnaroundDays: 0,
      avgRevisionsPerJob: 0,
      siteVisitsCompleted: 0,
      awaitingChecking: 0,
      avgJobsPerWeek: 0,
      completionTrend: "flat",
    })
  }

  const byDesigner = new Map<string, PerformanceEngineerRow>()
  for (const [id, row] of seed.entries()) byDesigner.set(id, row)
  const completionDays = new Map<string, number[]>()
  const revisionMap = new Map<string, Set<string>>()
  const completionCurrent = new Map<string, number>()
  const completionPrevious = new Map<string, number>()
  const weeks = Math.max(1, (daysBetween(ctx.period.from, ctx.period.to) + 1) / 7)

  function resolveEngineer(job: PerformanceJobRow): PerformanceEngineerRow {
    const key = job.designer.trim().toLowerCase()
    const known = usersByName.get(key)
    if (known) return byDesigner.get(known.id)!
    const syntheticId = `designer:${key}`
    const existing = byDesigner.get(syntheticId)
    if (existing) return existing
    const created: PerformanceEngineerRow = {
      userId: syntheticId,
      name: job.designer || "Unassigned",
      role: "ENGINEER",
      fromDirectory: false,
      jobsCompleted: 0,
      jobsAssigned: 0,
      avgTurnaroundDays: 0,
      avgRevisionsPerJob: 0,
      siteVisitsCompleted: 0,
      awaitingChecking: 0,
      avgJobsPerWeek: 0,
      completionTrend: "flat",
    }
    byDesigner.set(syntheticId, created)
    return created
  }

  for (const job of ctx.jobsAll) {
    const engineer = resolveEngineer(job)
    if (PERFORMANCE_ACTIVE_STATUSES.has(job.status)) engineer.jobsAssigned += 1
    if (job.status === AWAITING_CHECKING) engineer.awaitingChecking += 1
    if (job.status === COMPLETE_STATUS && job.itemType === "SITE_VISIT") engineer.siteVisitsCompleted += 1
  }

  for (const job of ctx.jobsInPeriod) {
    const engineer = resolveEngineer(job)
    if (job.status === COMPLETE_STATUS) {
      engineer.jobsCompleted += 1
      completionCurrent.set(engineer.userId, (completionCurrent.get(engineer.userId) ?? 0) + 1)
      if (job.completedDate) {
        const turnaround = daysBetween(job.createdDate, job.completedDate)
        const arr = completionDays.get(engineer.userId) ?? []
        arr.push(turnaround)
        completionDays.set(engineer.userId, arr)
      }
      if (job.parentJobId) {
        const set = revisionMap.get(engineer.userId) ?? new Set<string>()
        set.add(job.parentJobId)
        revisionMap.set(engineer.userId, set)
      }
    }
  }

  for (const job of ctx.jobsPrevPeriod) {
    const engineer = resolveEngineer(job)
    if (job.status === COMPLETE_STATUS) {
      completionPrevious.set(engineer.userId, (completionPrevious.get(engineer.userId) ?? 0) + 1)
    }
  }

  for (const row of byDesigner.values()) {
    const days = completionDays.get(row.userId) ?? []
    row.avgTurnaroundDays = round2(average(days))
    row.avgRevisionsPerJob =
      row.jobsCompleted === 0 ? 0 : round2((revisionMap.get(row.userId)?.size ?? 0) / row.jobsCompleted)
    row.avgJobsPerWeek = round2(row.jobsCompleted / weeks)
    row.completionTrend = trendFromDelta(
      (completionCurrent.get(row.userId) ?? 0) - (completionPrevious.get(row.userId) ?? 0),
    )
  }

  return [...byDesigner.values()].sort(
    (a, b) => b.jobsCompleted - a.jobsCompleted || a.name.localeCompare(b.name),
  )
}

function buildClientRows(ctx: AggregateContext): {
  topClients: PerformanceClientRow[]
  inactiveClients: PerformanceClientRow[]
  newClientsInPeriod: number
} {
  const jobsByClient = new Map<string, PerformanceJobRow[]>()
  for (const job of ctx.jobsAll) {
    if (!job.clientId) continue
    const list = jobsByClient.get(job.clientId) ?? []
    list.push(job)
    jobsByClient.set(job.clientId, list)
  }
  const monthBuckets = dateRangeMonths(ctx.period.from, ctx.period.to)
  const byId = new Map(ctx.clients.map(c => [c.id, c]))
  const rows: PerformanceClientRow[] = []
  for (const [clientId, jobs] of jobsByClient.entries()) {
    const client = byId.get(clientId)
    if (!client) continue
    const monthlyCounts = new Map<string, number>()
    let jobsInPeriod = 0
    let lastJobDate: string | null = null
    for (const job of jobs) {
      const month = getMonthLabel(job.createdDate)
      monthlyCounts.set(month, (monthlyCounts.get(month) ?? 0) + 1)
      if (inRange(job.createdDate, ctx.period.from, ctx.period.to)) jobsInPeriod += 1
      if (!lastJobDate || job.createdDate > lastJobDate) lastJobDate = job.createdDate
    }
    rows.push({
      clientId,
      clientName: client.name,
      totalJobs: jobs.length,
      jobsInPeriod,
      monthlyPoints: monthBuckets.map(month => ({
        key: month,
        label: month,
        value: monthlyCounts.get(month) ?? 0,
      })),
      lastJobDate,
      isNewThisMonth: client.createdAt.slice(0, 7) === ctx.period.to.slice(0, 7),
    })
  }
  const topClients = [...rows]
    .sort((a, b) => b.jobsInPeriod - a.jobsInPeriod || b.totalJobs - a.totalJobs)
    .slice(0, 12)
  const sixMonthsAgo = new Date(`${ctx.period.to}T00:00:00.000Z`)
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6)
  const sixMonthIso = sixMonthsAgo.toISOString().slice(0, 10)
  const inactiveClients = rows
    .filter(c => !c.lastJobDate || c.lastJobDate < sixMonthIso)
    .sort((a, b) => a.clientName.localeCompare(b.clientName))
  const newClientsInPeriod = ctx.clients.filter(c =>
    inRange(c.createdAt.slice(0, 10), ctx.period.from, ctx.period.to),
  ).length
  return { topClients, inactiveClients, newClientsInPeriod }
}

function buildTimeAnalytics(jobs: PerformanceJobRow[]): TimeAnalytics {
  const completed = jobs.filter(j => j.status === COMPLETE_STATUS && j.completedDate)
  const turnarounds = completed.map(j => daysBetween(j.createdDate, j.completedDate!))
  const waits = jobs
    .filter(j => j.status === AWAITING_CLIENT_INFORMATION)
    .map(j => daysBetween(j.createdDate, j.requiredByDate ?? j.createdDate))
  return {
    averageDesignTurnaroundDays: round2(average(turnarounds)),
    medianTurnaroundDays: round2(median(turnarounds)),
    fastestCompletionDays: turnarounds.length ? Math.min(...turnarounds) : 0,
    longestCompletionDays: turnarounds.length ? Math.max(...turnarounds) : 0,
    averageDaysWaitingForClientInformation: round2(average(waits)),
  }
}

function buildWorkloadAnalytics(
  jobsInPeriod: PerformanceJobRow[],
  jobsAll: PerformanceJobRow[],
  today: string,
): WorkloadAnalytics {
  const active = jobsAll.filter(j => PERFORMANCE_ACTIVE_STATUSES.has(j.status))
  const overdue = active.filter(j => j.requiredByDate && j.requiredByDate < today).length
  const dueThisWeekEnd = new Date(`${today}T00:00:00.000Z`)
  dueThisWeekEnd.setUTCDate(dueThisWeekEnd.getUTCDate() + 7)
  const dueNextWeekStart = new Date(`${today}T00:00:00.000Z`)
  dueNextWeekStart.setUTCDate(dueNextWeekStart.getUTCDate() + 8)
  const dueNextWeekEnd = new Date(`${today}T00:00:00.000Z`)
  dueNextWeekEnd.setUTCDate(dueNextWeekEnd.getUTCDate() + 14)
  const dueThisWeekIso = dueThisWeekEnd.toISOString().slice(0, 10)
  const dueNextStartIso = dueNextWeekStart.toISOString().slice(0, 10)
  const dueNextEndIso = dueNextWeekEnd.toISOString().slice(0, 10)
  const dueThisWeek = active.filter(
    j => j.requiredByDate && j.requiredByDate >= today && j.requiredByDate <= dueThisWeekIso,
  ).length
  const dueNextWeek = active.filter(
    j => j.requiredByDate && j.requiredByDate >= dueNextStartIso && j.requiredByDate <= dueNextEndIso,
  ).length
  const ages = active.map(j => daysBetween(j.createdDate, today))
  return {
    jobsCreated: jobsInPeriod.length,
    jobsCompleted: jobsInPeriod.filter(j => j.status === COMPLETE_STATUS).length,
    currentWorkload: active.length,
    outstandingJobs: active.length,
    averageAgeOfActiveJobs: round2(average(ages)),
    overdueJobs: overdue,
    dueThisWeek,
    dueNextWeek,
  }
}

function buildKpis(ctx: AggregateContext): KpiMetric[] {
  const inPeriod = ctx.jobsInPeriod
  const prev = ctx.jobsPrevPeriod
  const all = ctx.jobsAll
  const today = ctx.period.to
  const thisMonth = ctx.period.to.slice(0, 7)
  const thisYear = ctx.period.to.slice(0, 4)
  const revisionsByParent = new Map<string, number>()
  for (const job of all) {
    if (!job.parentJobId) continue
    revisionsByParent.set(job.parentJobId, (revisionsByParent.get(job.parentJobId) ?? 0) + 1)
  }
  const turnaround = inPeriod
    .filter(j => j.status === COMPLETE_STATUS && j.completedDate)
    .map(j => daysBetween(j.createdDate, j.completedDate!))
  const prevTurnaround = prev
    .filter(j => j.status === COMPLETE_STATUS && j.completedDate)
    .map(j => daysBetween(j.createdDate, j.completedDate!))
  return [
    kpi("total-created", "Total Jobs Created", inPeriod.length, prev.length),
    kpi(
      "total-completed",
      "Total Jobs Completed",
      inPeriod.filter(j => j.status === COMPLETE_STATUS).length,
      prev.filter(j => j.status === COMPLETE_STATUS).length,
    ),
    kpi(
      "active-jobs",
      "Active Jobs",
      all.filter(j => PERFORMANCE_ACTIVE_STATUSES.has(j.status)).length,
      prev.filter(j => PERFORMANCE_ACTIVE_STATUSES.has(j.status)).length,
    ),
    kpi(
      "awaiting-checking",
      "Jobs Awaiting Checking",
      all.filter(j => j.status === AWAITING_CHECKING).length,
      prev.filter(j => j.status === AWAITING_CHECKING).length,
    ),
    kpi(
      "awaiting-client-info",
      "Jobs Awaiting Client Information",
      all.filter(j => j.status === AWAITING_CLIENT_INFORMATION).length,
      prev.filter(j => j.status === AWAITING_CLIENT_INFORMATION).length,
    ),
    kpi(
      "avg-completion-time",
      "Average Completion Time",
      round2(average(turnaround)),
      round2(average(prevTurnaround)),
    ),
    kpi(
      "completed-this-month",
      "Jobs Completed This Month",
      all.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisMonth)).length,
      prev.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisMonth)).length,
    ),
    kpi(
      "completed-this-year",
      "Jobs Completed This Year",
      all.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisYear)).length,
      prev.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisYear)).length,
    ),
    kpi(
      "avg-revisions-per-job",
      "Average Revisions Per Job",
      round2(average([...revisionsByParent.values()])),
      round2(average([...revisionsByParent.values()])),
    ),
    kpi(
      "avg-turnaround",
      "Average Turnaround Time",
      round2(average(turnaround)),
      round2(average(prevTurnaround)),
    ),
    kpi(
      "active-clients",
      "Number of Active Clients",
      ctx.clients.filter(c => c.active === 1).length,
      ctx.clients.filter(c => c.active === 1).length,
    ),
    kpi(
      "new-clients-month",
      "New Clients This Month",
      ctx.clients.filter(c => c.createdAt.startsWith(thisMonth)).length,
      0,
    ),
    kpi(
      "site-visits-completed",
      "Site Visits Completed",
      inPeriod.filter(j => j.itemType === "SITE_VISIT" && j.status === COMPLETE_STATUS).length,
      prev.filter(j => j.itemType === "SITE_VISIT" && j.status === COMPLETE_STATUS).length,
    ),
    kpi(
      "designs-completed-today",
      "Designs Completed Today",
      all.filter(j => j.status === COMPLETE_STATUS && j.completedDate === today).length,
      prev.filter(j => j.status === COMPLETE_STATUS && j.completedDate === today).length,
    ),
  ]
}

function buildFilterOptions(
  jobs: PerformanceJobRow[],
  clients: PerformanceRawClient[],
  users: PerformanceRawUser[],
): FilterOptions {
  const tags = new Set<string>()
  const statuses = new Set<string>()
  for (const job of jobs) {
    for (const tag of job.tags) tags.add(tag)
    statuses.add(job.status)
  }
  return {
    engineers: users.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    clients: clients.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    statuses: [...statuses]
      .sort()
      .map(status => ({
        value: status,
        label: JOB_STATUSES.find(s => s.value === status)?.label ?? status,
      })),
    jobTypes: WORK_ITEM_TYPES.map(t => ({ value: t.value, label: t.label })),
    tags: [...tags].sort(),
  }
}

export function applyPerformanceFilters(
  jobs: PerformanceJobRow[],
  filters: PerformanceFilters,
): PerformanceJobRow[] {
  return jobs.filter(job => {
    if (filters.engineer !== PERFORMANCE_DEFAULT_FILTER && job.designer !== filters.engineer) return false
    if (filters.clientId !== PERFORMANCE_DEFAULT_FILTER && job.clientId !== filters.clientId) return false
    if (filters.jobType !== PERFORMANCE_DEFAULT_FILTER && job.itemType !== filters.jobType) return false
    if (filters.tag !== PERFORMANCE_DEFAULT_FILTER && !job.tags.includes(filters.tag)) return false
    if (filters.status !== PERFORMANCE_DEFAULT_FILTER && job.status !== filters.status) return false
    return true
  })
}

export function performanceRowsFromRawJobs(rows: PerformanceRawJob[]): PerformanceJobRow[] {
  return rows.map(row => ({
    id: row.id,
    drawingNumber: row.drawingNumber,
    clientId: row.clientId,
    clientCompany: row.clientCompany,
    designer: row.designer || "Unassigned",
    status: row.status,
    itemType: row.itemType,
    tags: row.tags ?? [],
    createdDate: toIsoDate(row.dateCreated) ?? "1970-01-01",
    completedDate: toIsoDate(row.dateCompleted),
    requiredByDate: toIsoDate(row.requiredByDate),
    requestedDate: toIsoDate(row.requestedDate),
    parentJobId: row.parentJobId,
  }))
}

/**
 * Golden reference aggregator. Used by:
 * - SQLite / slim-row fallback path
 * - Parity tests against SQL RPC results
 */
export function aggregatePerformancePayloadFromData(opts: {
  jobsRaw: PerformanceRawJob[]
  clients: PerformanceRawClient[]
  users: PerformanceRawUser[]
  filters: PerformanceFilters
  period: PerformancePeriod
  /** When false, `jobs` is [] (SQL page path). Default true for reference/export. */
  includeJobs?: boolean
}): PerformancePayload {
  const previousPeriod = getPreviousPeriod(opts.period)
  const allJobs = performanceRowsFromRawJobs(opts.jobsRaw)
  const filtered = applyPerformanceFilters(allJobs, opts.filters)
  const jobsInPeriod = filtered.filter(j => inRange(j.createdDate, opts.period.from, opts.period.to))
  const jobsPrevPeriod = filtered.filter(j =>
    inRange(j.createdDate, previousPeriod.from, previousPeriod.to),
  )
  const ctx: AggregateContext = {
    jobsInPeriod,
    jobsPrevPeriod,
    jobsAll: filtered,
    clients: opts.clients,
    users: opts.users,
    period: opts.period,
    previousPeriod,
  }

  const engineerRows = buildEngineerRows(ctx)
  const clientAgg = buildClientRows(ctx)
  const revisions = filtered.filter(j => !!j.parentJobId)
  const revisionsByParent = new Map<string, number>()
  for (const rev of revisions) {
    const parentId = rev.parentJobId!
    revisionsByParent.set(parentId, (revisionsByParent.get(parentId) ?? 0) + 1)
  }
  const revisionCounts = [...revisionsByParent.values()]
  const revisionCountFreq = new Map<number, number>()
  for (const count of revisionCounts) {
    revisionCountFreq.set(count, (revisionCountFreq.get(count) ?? 0) + 1)
  }
  const mostCommonRevisionCount =
    [...revisionCountFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0

  return {
    period: opts.period,
    filters: opts.filters,
    filterOptions: buildFilterOptions(allJobs, opts.clients, opts.users),
    kpis: buildKpis(ctx),
    jobsByMonth: buildSeries(dateRangeMonths(opts.period.from, opts.period.to), filtered, "month"),
    jobsByWeek: buildSeries(dateRangeWeeks(opts.period.from, opts.period.to), filtered, "week"),
    jobsByDay: buildSeries(dateRangeDays(opts.period.from, opts.period.to), filtered, "day"),
    jobsByStatus: buildStatusBreakdown(filtered),
    engineerRows,
    engineerComparison: engineerRows.slice(0, 12).map(row => ({
      key: row.userId,
      label: row.name,
      value: row.jobsCompleted,
    })),
    topClients: clientAgg.topClients,
    inactiveClients: clientAgg.inactiveClients,
    newClientsInPeriod: clientAgg.newClientsInPeriod,
    revisionAnalytics: {
      totalRevisions: revisions.length,
      averageRevisionsPerJob: round2(average(revisionCounts)),
      jobsRequiringMultipleRevisions: revisionCounts.filter(n => n >= 2).length,
      revisionTrendByMonth: dateRangeMonths(opts.period.from, opts.period.to).map(month => ({
        key: month,
        label: month,
        value: revisions.filter(r => r.createdDate.startsWith(month)).length,
      })),
      mostCommonRevisionCount,
    },
    workloadAnalytics: buildWorkloadAnalytics(jobsInPeriod, filtered, opts.period.to),
    timeAnalytics: buildTimeAnalytics(jobsInPeriod),
    jobs: opts.includeJobs === false ? [] : filtered,
  }
}

/** Structural scale metric: how many job rows the Node aggregator would ingest. */
export function countPerformanceJobRowsTransferred(jobsRaw: PerformanceRawJob[]): number {
  return jobsRaw.length
}
