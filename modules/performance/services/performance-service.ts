import { JOB_STATUSES, WORK_ITEM_TYPES } from "@/lib/constants"
import { jobService } from "@/modules/jobs"
import { clientService } from "@/modules/clients"
import { userService } from "@/modules/users"
import { coerceRole } from "@/shared/types/role"
import type {
  ChartPoint,
  FilterOptions,
  KpiMetric,
  PerformanceEmployeeRow,
  PerformanceClientRow,
  PerformanceEngineerRow,
  PerformanceFilters,
  PerformanceJobRow,
  PerformanceOverview,
  PerformancePayload,
  PerformancePeriod,
  PerformanceRole,
  StatusBreakdownRow,
  TimeAnalytics,
  TrendDirection,
  WorkloadAnalytics,
} from "../types"

const DEFAULT_FILTER = "all"
const DAY_MS = 86_400_000
const ACTIVE_STATUSES = new Set(["NEW_REQUEST", "IN_DESIGN", "CHECKING", "READY_TO_SEND"])
const AWAITING_CHECKING = "CHECKING"
const AWAITING_CLIENT_INFORMATION = "READY_TO_SEND"
const COMPLETE_STATUS = "ISSUED"

type RawJob = {
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

type RawClient = { id: string; name: string; createdAt: string; active: number }
type RawUser = { id: string; name: string; role: string; active: number }

type AggregateContext = {
  jobsInPeriod: PerformanceJobRow[]
  jobsPrevPeriod: PerformanceJobRow[]
  jobsAll: PerformanceJobRow[]
  clients: RawClient[]
  users: RawUser[]
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

function daysBetween(start: string, end: string): number {
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

function round2(value: number): number {
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

function dateRangeDays(from: string, to: string): string[] {
  const out: string[] = []
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return out
  for (let t = start; t <= end; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

function dateRangeMonths(from: string, to: string): string[] {
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

function dateRangeWeeks(from: string, to: string): string[] {
  const days = dateRangeDays(from, to)
  return [...new Set(days.map(toWeekLabel))]
}

export function resolvePerformancePeriod(fromParam?: string | null, toParam?: string | null): PerformancePeriod {
  const today = new Date().toISOString().slice(0, 10)
  const defaultFrom = `${today.slice(0, 7)}-01`
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? "") ? String(fromParam) : defaultFrom
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam ?? "") ? String(toParam) : today
  const normalizedFrom = to < from ? to : from
  const normalizedTo = to < from ? from : to
  return { from: normalizedFrom, to: normalizedTo }
}

export function resolvePerformanceFilters(
  period: PerformancePeriod,
  query: URLSearchParams,
): PerformanceFilters {
  return {
    from: period.from,
    to: period.to,
    engineer: query.get("engineer")?.trim() || DEFAULT_FILTER,
    clientId: query.get("clientId")?.trim() || DEFAULT_FILTER,
    jobType: query.get("jobType")?.trim() || DEFAULT_FILTER,
    tag: query.get("tag")?.trim() || DEFAULT_FILTER,
    status: query.get("status")?.trim() || DEFAULT_FILTER,
  }
}

function inRange(day: string | null, from: string, to: string): boolean {
  return !!day && day >= from && day <= to
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
  const usersByName = new Map<string, RawUser>()
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
    if (ACTIVE_STATUSES.has(job.status)) engineer.jobsAssigned += 1
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
    row.avgRevisionsPerJob = row.jobsCompleted === 0 ? 0 : round2((revisionMap.get(row.userId)?.size ?? 0) / row.jobsCompleted)
    row.avgJobsPerWeek = round2(row.jobsCompleted / weeks)
    row.completionTrend = trendFromDelta((completionCurrent.get(row.userId) ?? 0) - (completionPrevious.get(row.userId) ?? 0))
  }

  return [...byDesigner.values()].sort((a, b) => b.jobsCompleted - a.jobsCompleted || a.name.localeCompare(b.name))
}

function buildClientRows(ctx: AggregateContext): { topClients: PerformanceClientRow[]; inactiveClients: PerformanceClientRow[]; newClientsInPeriod: number } {
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
      monthlyPoints: monthBuckets.map(month => ({ key: month, label: month, value: monthlyCounts.get(month) ?? 0 })),
      lastJobDate,
      isNewThisMonth: client.createdAt.slice(0, 7) === ctx.period.to.slice(0, 7),
    })
  }
  const topClients = [...rows].sort((a, b) => b.jobsInPeriod - a.jobsInPeriod || b.totalJobs - a.totalJobs).slice(0, 12)
  const sixMonthsAgo = new Date(`${ctx.period.to}T00:00:00.000Z`)
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6)
  const sixMonthIso = sixMonthsAgo.toISOString().slice(0, 10)
  const inactiveClients = rows.filter(c => !c.lastJobDate || c.lastJobDate < sixMonthIso).sort((a, b) => a.clientName.localeCompare(b.clientName))
  const newClientsInPeriod = ctx.clients.filter(c => inRange(c.createdAt.slice(0, 10), ctx.period.from, ctx.period.to)).length
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

function buildWorkloadAnalytics(jobsInPeriod: PerformanceJobRow[], jobsAll: PerformanceJobRow[], today: string): WorkloadAnalytics {
  const active = jobsAll.filter(j => ACTIVE_STATUSES.has(j.status))
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
  const dueThisWeek = active.filter(j => j.requiredByDate && j.requiredByDate >= today && j.requiredByDate <= dueThisWeekIso).length
  const dueNextWeek = active.filter(j => j.requiredByDate && j.requiredByDate >= dueNextStartIso && j.requiredByDate <= dueNextEndIso).length
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
    kpi("total-completed", "Total Jobs Completed", inPeriod.filter(j => j.status === COMPLETE_STATUS).length, prev.filter(j => j.status === COMPLETE_STATUS).length),
    kpi("active-jobs", "Active Jobs", all.filter(j => ACTIVE_STATUSES.has(j.status)).length, prev.filter(j => ACTIVE_STATUSES.has(j.status)).length),
    kpi("awaiting-checking", "Jobs Awaiting Checking", all.filter(j => j.status === AWAITING_CHECKING).length, prev.filter(j => j.status === AWAITING_CHECKING).length),
    kpi("awaiting-client-info", "Jobs Awaiting Client Information", all.filter(j => j.status === AWAITING_CLIENT_INFORMATION).length, prev.filter(j => j.status === AWAITING_CLIENT_INFORMATION).length),
    kpi("avg-completion-time", "Average Completion Time", round2(average(turnaround)), round2(average(prevTurnaround))),
    kpi("completed-this-month", "Jobs Completed This Month", all.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisMonth)).length, prev.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisMonth)).length),
    kpi("completed-this-year", "Jobs Completed This Year", all.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisYear)).length, prev.filter(j => j.status === COMPLETE_STATUS && j.completedDate?.startsWith(thisYear)).length),
    kpi("avg-revisions-per-job", "Average Revisions Per Job", round2(average([...revisionsByParent.values()])), round2(average([...revisionsByParent.values()]))),
    kpi("avg-turnaround", "Average Turnaround Time", round2(average(turnaround)), round2(average(prevTurnaround))),
    kpi("active-clients", "Number of Active Clients", ctx.clients.filter(c => c.active === 1).length, ctx.clients.filter(c => c.active === 1).length),
    kpi("new-clients-month", "New Clients This Month", ctx.clients.filter(c => c.createdAt.startsWith(thisMonth)).length, 0),
    kpi("site-visits-completed", "Site Visits Completed", inPeriod.filter(j => j.itemType === "SITE_VISIT" && j.status === COMPLETE_STATUS).length, prev.filter(j => j.itemType === "SITE_VISIT" && j.status === COMPLETE_STATUS).length),
    kpi("designs-completed-today", "Designs Completed Today", all.filter(j => j.status === COMPLETE_STATUS && j.completedDate === today).length, prev.filter(j => j.status === COMPLETE_STATUS && j.completedDate === today).length),
  ]
}

function getPreviousPeriod(period: PerformancePeriod): { from: string; to: string } {
  const spanDays = daysBetween(period.from, period.to) + 1
  const prevToMs = Date.parse(`${period.from}T00:00:00.000Z`) - DAY_MS
  const prevFromMs = prevToMs - ((spanDays - 1) * DAY_MS)
  return {
    from: new Date(prevFromMs).toISOString().slice(0, 10),
    to: new Date(prevToMs).toISOString().slice(0, 10),
  }
}

// Legacy employee aggregation kept for existing unit tests.
export function aggregatePerformance(opts: {
  users: Array<{ id: string; name: string; role?: string | null; email?: string | null; emailLower?: string | null; active?: number }>
  jobs: Array<{ designer: string; status: string; dateCompleted: string | null; requiredByDate: string | null; updatedAt?: string | null }>
  period: { from: string; to: string }
  today?: string
}): { period: { from: string; to: string }; overview: PerformanceOverview; employees: PerformanceEmployeeRow[] } {
  const today = opts.today ?? new Date().toISOString().slice(0, 10)
  const weeks = Math.max(1, (daysBetween(opts.period.from, opts.period.to) + 1) / 7)
  const usersByName = new Map<string, PerformanceEmployeeRow>()
  const firstNameLookup = new Map<string, string>()
  const emailLookup = new Map<string, string>()

  const remember = (map: Map<string, string>, alias: string, key: string) => {
    if (!alias) return
    if (map.has(alias) && map.get(alias) !== key) map.set(alias, "")
    else if (!map.has(alias)) map.set(alias, key)
  }

  const rowFor = (id: string, name: string, role: PerformanceRole, fromDirectory: boolean): PerformanceEmployeeRow => ({
    userId: id, name, role, fromDirectory, completedInPeriod: 0, completedAllTime: 0, avgPerWeek: 0, inProgress: 0, awaitingChecking: 0, overdue: 0, lastCompletedAt: null,
  })

  for (const user of opts.users) {
    const display = user.name.trim().replace(/\s+/g, " ")
    if (!display) continue
    const key = normalizeKey(display)
    if (!usersByName.has(key)) usersByName.set(key, rowFor(user.id, display, normalizeRole(user.role), true))
    remember(firstNameLookup, key.split(" ")[0] ?? "", key)
    const email = (user.emailLower ?? user.email ?? "").toLowerCase()
    const local = email.includes("@") ? email.slice(0, email.indexOf("@")) : ""
    remember(emailLookup, local, key)
  }

  const resolve = (designerRaw: string): PerformanceEmployeeRow | null => {
    const key = normalizeKey(designerRaw)
    if (!key) return null
    const exact = usersByName.get(key)
    if (exact) return exact
    const first = firstNameLookup.get(key.split(" ")[0] ?? "")
    if (first) {
      const row = usersByName.get(first)
      if (row) return row
    }
    const local = emailLookup.get(key)
    if (local) {
      const row = usersByName.get(local)
      if (row) return row
    }
    const synthetic = rowFor(`designer:${key}`, designerRaw.trim().replace(/\s+/g, " "), "ENGINEER", false)
    usersByName.set(key, synthetic)
    return synthetic
  }

  for (const job of opts.jobs) {
    const row = resolve(job.designer)
    if (!row) continue
    const completedDay = toIsoDate(job.dateCompleted) ?? toIsoDate(job.updatedAt)
    if (job.status === "ISSUED") {
      row.completedAllTime += 1
      if (inRange(completedDay, opts.period.from, opts.period.to)) row.completedInPeriod += 1
      if (completedDay && (!row.lastCompletedAt || completedDay > row.lastCompletedAt)) row.lastCompletedAt = completedDay
    }
    if (ACTIVE_STATUSES.has(job.status)) {
      row.inProgress += 1
      if (job.status === "CHECKING") row.awaitingChecking += 1
      const due = toIsoDate(job.requiredByDate)
      if (due && due < today) row.overdue += 1
    }
  }

  const employees = [...usersByName.values()].map(row => ({ ...row, avgPerWeek: round2(row.completedInPeriod / weeks) }))
    .sort((a, b) => b.completedInPeriod - a.completedInPeriod || a.name.localeCompare(b.name))
  const directory = employees.filter(e => e.fromDirectory)
  const overview: PerformanceOverview = {
    completedInPeriod: employees.reduce((n, e) => n + e.completedInPeriod, 0),
    inProgress: employees.reduce((n, e) => n + e.inProgress, 0),
    avgCompletedPerWeek: round2(employees.reduce((n, e) => n + e.completedInPeriod, 0) / weeks),
    activeDesigners: employees.filter(e => e.inProgress > 0).length,
    awaitingChecking: employees.reduce((n, e) => n + e.awaitingChecking, 0),
    overdue: employees.reduce((n, e) => n + e.overdue, 0),
    totalUsers: directory.length,
    adminUsers: directory.filter(e => e.role === "ADMIN").length,
    engineerUsers: directory.filter(e => e.role === "ENGINEER").length,
  }
  return { period: opts.period, overview, employees }
}

function buildFilterOptions(jobs: PerformanceJobRow[], clients: RawClient[], users: RawUser[]): FilterOptions {
  const tags = new Set<string>()
  const statuses = new Set<string>()
  for (const job of jobs) {
    for (const tag of job.tags) tags.add(tag)
    statuses.add(job.status)
  }
  return {
    engineers: users.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    clients: clients.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    statuses: [...statuses].sort().map(status => ({ value: status, label: JOB_STATUSES.find(s => s.value === status)?.label ?? status })),
    jobTypes: WORK_ITEM_TYPES.map(t => ({ value: t.value, label: t.label })),
    tags: [...tags].sort(),
  }
}

function applyFilters(jobs: PerformanceJobRow[], filters: PerformanceFilters): PerformanceJobRow[] {
  return jobs.filter(job => {
    if (filters.engineer !== DEFAULT_FILTER && job.designer !== filters.engineer) return false
    if (filters.clientId !== DEFAULT_FILTER && job.clientId !== filters.clientId) return false
    if (filters.jobType !== DEFAULT_FILTER && job.itemType !== filters.jobType) return false
    if (filters.tag !== DEFAULT_FILTER && !job.tags.includes(filters.tag)) return false
    if (filters.status !== DEFAULT_FILTER && job.status !== filters.status) return false
    return true
  })
}

function buildPerformanceRows(rows: RawJob[]): PerformanceJobRow[] {
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

export async function buildPerformancePayload(filters: PerformanceFilters, period: PerformancePeriod): Promise<PerformancePayload> {
  const previousPeriod = getPreviousPeriod(period)
  const [jobsRaw, clientsRaw, usersRaw] = await Promise.all([
    jobService.findMany({
      where: { includeArchived: false },
      orderBy: { field: "dateCreated", dir: "desc" },
      take: 25_000,
    }) as Promise<RawJob[]>,
    clientService.findMany({ take: 10_000 }) as Promise<RawClient[]>,
    userService.findMany() as Promise<RawUser[]>,
  ])

  const allJobs = buildPerformanceRows(jobsRaw)
  const filtered = applyFilters(allJobs, filters)
  const jobsInPeriod = filtered.filter(j => inRange(j.createdDate, period.from, period.to))
  const jobsPrevPeriod = filtered.filter(j => inRange(j.createdDate, previousPeriod.from, previousPeriod.to))
  const ctx: AggregateContext = { jobsInPeriod, jobsPrevPeriod, jobsAll: filtered, clients: clientsRaw, users: usersRaw, period, previousPeriod }

  const jobsByMonth = buildSeries(dateRangeMonths(period.from, period.to), filtered, "month")
  const jobsByWeek = buildSeries(dateRangeWeeks(period.from, period.to), filtered, "week")
  const jobsByDay = buildSeries(dateRangeDays(period.from, period.to), filtered, "day")
  const jobsByStatus = buildStatusBreakdown(filtered)
  const engineerRows = buildEngineerRows(ctx)
  const engineerComparison = engineerRows.slice(0, 12).map(row => ({ key: row.userId, label: row.name, value: row.jobsCompleted }))
  const clientAgg = buildClientRows(ctx)
  const revisions = filtered.filter(j => !!j.parentJobId)
  const revisionsByParent = new Map<string, number>()
  for (const rev of revisions) {
    const parentId = rev.parentJobId!
    revisionsByParent.set(parentId, (revisionsByParent.get(parentId) ?? 0) + 1)
  }
  const revisionCounts = [...revisionsByParent.values()]
  const revisionCountFreq = new Map<number, number>()
  for (const count of revisionCounts) revisionCountFreq.set(count, (revisionCountFreq.get(count) ?? 0) + 1)
  const mostCommonRevisionCount = [...revisionCountFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
  const revisionAnalytics = {
    totalRevisions: revisions.length,
    averageRevisionsPerJob: round2(average(revisionCounts)),
    jobsRequiringMultipleRevisions: revisionCounts.filter(n => n >= 2).length,
    revisionTrendByMonth: dateRangeMonths(period.from, period.to).map(month => ({
      key: month,
      label: month,
      value: revisions.filter(r => r.createdDate.startsWith(month)).length,
    })),
    mostCommonRevisionCount,
  }
  const workloadAnalytics = buildWorkloadAnalytics(jobsInPeriod, filtered, period.to)
  const timeAnalytics = buildTimeAnalytics(jobsInPeriod)

  return {
    period,
    filters,
    filterOptions: buildFilterOptions(allJobs, clientsRaw, usersRaw),
    kpis: buildKpis(ctx),
    jobsByMonth,
    jobsByWeek,
    jobsByDay,
    jobsByStatus,
    engineerRows,
    engineerComparison,
    topClients: clientAgg.topClients,
    inactiveClients: clientAgg.inactiveClients,
    newClientsInPeriod: clientAgg.newClientsInPeriod,
    revisionAnalytics,
    workloadAnalytics,
    timeAnalytics,
    jobs: filtered,
  }
}
