/**
 * Performance page orchestration.
 * Supabase preferred path: performance_aggregate RPC (no full job transfer).
 * SQLite / RPC-missing fallback: slim findPerformanceFields + Node golden aggregator.
 */
import { jobService } from "@/modules/jobs"
import { clientService } from "@/modules/clients"
import { userService } from "@/modules/users"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { logEvent } from "@/shared/logger"
import { JOB_STATUSES, WORK_ITEM_TYPES } from "@/lib/constants"
import type {
  PerformanceEmployeeRow,
  PerformanceFilters,
  PerformanceOverview,
  PerformancePayload,
  PerformancePeriod,
  PerformanceRole,
} from "../types"
import {
  aggregatePerformancePayloadFromData,
  getPreviousPeriod,
  normalizeKey,
  normalizeRole,
  PERFORMANCE_DEFAULT_FILTER,
  type PerformanceRawClient,
  type PerformanceRawJob,
  type PerformanceRawUser,
} from "../lib/aggregate-performance"

const DAY_MS = 86_400_000
const ACTIVE_STATUSES = new Set(["NEW_REQUEST", "IN_DESIGN", "CHECKING", "READY_TO_SEND"])

export { normalizeKey, normalizeRole, performanceRowsFromRawJobs } from "../lib/aggregate-performance"
export { aggregatePerformancePayloadFromData } from "../lib/aggregate-performance"

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
    engineer: query.get("engineer")?.trim() || PERFORMANCE_DEFAULT_FILTER,
    clientId: query.get("clientId")?.trim() || PERFORMANCE_DEFAULT_FILTER,
    jobType: query.get("jobType")?.trim() || PERFORMANCE_DEFAULT_FILTER,
    tag: query.get("tag")?.trim() || PERFORMANCE_DEFAULT_FILTER,
    status: query.get("status")?.trim() || PERFORMANCE_DEFAULT_FILTER,
  }
}

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

function inRange(day: string | null, from: string, to: string): boolean {
  return !!day && day >= from && day <= to
}

function daysBetween(start: string, end: string): number {
  const fromMs = Date.parse(`${start}T00:00:00.000Z`)
  const toMs = Date.parse(`${end}T00:00:00.000Z`)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return 0
  return Math.max(0, Math.round((toMs - fromMs) / DAY_MS))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
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

type SqlAggregateResult = {
  kpis: PerformancePayload["kpis"]
  jobsByMonth: PerformancePayload["jobsByMonth"]
  jobsByWeek: PerformancePayload["jobsByWeek"]
  jobsByDay: PerformancePayload["jobsByDay"]
  jobsByStatus: PerformancePayload["jobsByStatus"]
  engineerRows: PerformancePayload["engineerRows"]
  engineerComparison: PerformancePayload["engineerComparison"]
  topClients: PerformancePayload["topClients"]
  inactiveClients: PerformancePayload["inactiveClients"]
  newClientsInPeriod: number
  revisionAnalytics: PerformancePayload["revisionAnalytics"]
  workloadAnalytics: PerformancePayload["workloadAnalytics"]
  timeAnalytics: PerformancePayload["timeAnalytics"]
  filterTags?: string[]
  filterStatuses?: string[]
}

function filterParam(value: string): string | null {
  const v = value.trim()
  if (!v || v === PERFORMANCE_DEFAULT_FILTER) return null
  return v
}

async function loadClientsAndUsers(): Promise<{
  clients: PerformanceRawClient[]
  users: PerformanceRawUser[]
}> {
  const [clientsRaw, usersRaw] = await Promise.all([
    clientService.findMany({ take: 10_000 }) as Promise<PerformanceRawClient[]>,
    userService.findMany() as Promise<PerformanceRawUser[]>,
  ])
  return { clients: clientsRaw, users: usersRaw }
}

function mergeFilterOptions(
  clients: PerformanceRawClient[],
  users: PerformanceRawUser[],
  filterTags: string[] | undefined,
  filterStatuses: string[] | undefined,
): PerformancePayload["filterOptions"] {
  const tags = [...(filterTags ?? [])].sort()
  const statuses = [...(filterStatuses ?? [])].sort()
  return {
    engineers: users.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    clients: clients.map(c => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    statuses: statuses.map(status => ({
      value: status,
      label: JOB_STATUSES.find(s => s.value === status)?.label ?? status,
    })),
    jobTypes: WORK_ITEM_TYPES.map(t => ({ value: t.value, label: t.label })),
    tags,
  }
}

async function buildFromSqlAggregate(
  filters: PerformanceFilters,
  period: PerformancePeriod,
  includeJobs: boolean,
): Promise<PerformancePayload | null> {
  const findAgg = (
    jobService as {
      findPerformanceAggregate?: (opts: {
        from: string
        to: string
        engineer?: string | null
        clientId?: string | null
        itemType?: string | null
        tag?: string | null
        status?: string | null
      }) => Promise<SqlAggregateResult | null>
    }
  ).findPerformanceAggregate

  if (!findAgg) return null

  const [aggRaw, { clients, users }] = await Promise.all([
    findAgg({
      from: period.from,
      to: period.to,
      engineer: filterParam(filters.engineer),
      clientId: filterParam(filters.clientId),
      itemType: filterParam(filters.jobType),
      tag: filterParam(filters.tag),
      status: filterParam(filters.status),
    }),
    loadClientsAndUsers(),
  ])

  if (!aggRaw || !Array.isArray(aggRaw.kpis)) return null
  const agg = aggRaw as unknown as SqlAggregateResult

  let jobs: PerformancePayload["jobs"] = []
  if (includeJobs) {
    // Export only — filtered slim rows (not used for KPI math on SQL path).
    const {
      applyPerformanceFilters,
      performanceRowsFromRawJobs,
    } = await import("../lib/aggregate-performance")
    const jobsRaw = (await jobService.findPerformanceFields()) as PerformanceRawJob[]
    jobs = applyPerformanceFilters(performanceRowsFromRawJobs(jobsRaw), filters)
  }

  return {
    period,
    filters,
    filterOptions: mergeFilterOptions(clients, users, agg.filterTags, agg.filterStatuses),
    kpis: agg.kpis,
    jobsByMonth: agg.jobsByMonth,
    jobsByWeek: agg.jobsByWeek,
    jobsByDay: agg.jobsByDay,
    jobsByStatus: agg.jobsByStatus,
    engineerRows: agg.engineerRows,
    engineerComparison: agg.engineerComparison,
    topClients: agg.topClients,
    inactiveClients: agg.inactiveClients,
    newClientsInPeriod: agg.newClientsInPeriod,
    revisionAnalytics: agg.revisionAnalytics,
    workloadAnalytics: agg.workloadAnalytics,
    timeAnalytics: agg.timeAnalytics,
    jobs,
  }
}

async function buildFromSlimRows(
  filters: PerformanceFilters,
  period: PerformancePeriod,
  includeJobs: boolean,
): Promise<PerformancePayload> {
  const [jobsRaw, { clients, users }] = await Promise.all([
    jobService.findPerformanceFields() as Promise<PerformanceRawJob[]>,
    loadClientsAndUsers(),
  ])
  return aggregatePerformancePayloadFromData({
    jobsRaw,
    clients,
    users,
    filters,
    period,
    includeJobs,
  })
}

/**
 * @param includeJobs — export paths need the filtered job list; the page does not.
 */
export async function buildPerformancePayload(
  filters: PerformanceFilters,
  period: PerformancePeriod,
  opts: { includeJobs?: boolean } = {},
): Promise<PerformancePayload> {
  const includeJobs = opts.includeJobs === true
  // Touch previous period helper so tree-shaking keeps it available for tests.
  void getPreviousPeriod

  if (isSupabaseOnly()) {
    try {
      const sqlPayload = await buildFromSqlAggregate(filters, period, includeJobs)
      if (sqlPayload) {
        logEvent("performance.aggregate_rpc", { path: "sql", includeJobs })
        return sqlPayload
      }
      logEvent("performance.aggregate_rpc_fallback", { reason: "rpc_missing_or_null" }, "warn")
    } catch (err) {
      logEvent(
        "performance.aggregate_rpc_fallback",
        {
          reason: "rpc_error",
          error: err instanceof Error ? err.message : String(err),
        },
        "warn",
      )
    }
  }

  logEvent("performance.aggregate_slim_rows", {
    path: isSupabaseOnly() ? "supabase_fallback" : "sqlite",
    includeJobs,
  })
  return buildFromSlimRows(filters, period, includeJobs)
}
