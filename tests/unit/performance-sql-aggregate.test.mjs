import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  aggregatePerformancePayloadFromData,
  applyPerformanceFilters,
  countPerformanceJobRowsTransferred,
  getPreviousPeriod,
  performanceRowsFromRawJobs,
} from "../../modules/performance/lib/aggregate-performance.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration048 = readFileSync(
  join(__dirname, "../../supabase/migrations/048_performance_aggregate.sql"),
  "utf8",
)
const serviceSrc = readFileSync(
  join(__dirname, "../../modules/performance/services/performance-service.ts"),
  "utf8",
)
const exportSrc = readFileSync(
  join(__dirname, "../../modules/performance/api/export.ts"),
  "utf8",
)

function sqlBody(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "")
}

const baseFilters = {
  from: "2026-07-01",
  to: "2026-07-31",
  engineer: "all",
  clientId: "all",
  jobType: "all",
  tag: "all",
  status: "all",
}

const period = { from: "2026-07-01", to: "2026-07-31" }

const users = [
  { id: "u1", name: "Priya Shah", role: "ENGINEER", active: 1 },
  { id: "u2", name: "Admin User", role: "ADMIN", active: 1 },
]

const clients = [
  { id: "c1", name: "Acme Scaffolding", createdAt: "2026-07-05T10:00:00.000Z", active: 1 },
  { id: "c2", name: "Beta Ltd", createdAt: "2025-01-01T10:00:00.000Z", active: 1 },
  { id: "c3", name: "Inactive Co", createdAt: "2024-01-01T10:00:00.000Z", active: 0 },
]

function job(partial) {
  return {
    id: "j1",
    drawingNumber: "26/ORYX/01/001",
    clientId: "c1",
    clientCompany: "Acme Scaffolding",
    designer: "Priya Shah",
    status: "ISSUED",
    itemType: "DESIGN",
    tags: ["CAT II"],
    dateCreated: "2026-07-10T12:00:00.000Z",
    dateCompleted: "2026-07-15",
    requiredByDate: "2026-07-20",
    requestedDate: "2026-07-01",
    parentJobId: null,
    ...partial,
  }
}

describe("migration 048 performance_aggregate", () => {
  const sql = sqlBody(migration048)

  it("defines SECURITY DEFINER RPC with service_role grant only", () => {
    assert.match(sql, /create or replace function public\.performance_aggregate/i)
    assert.match(sql, /security definer/i)
    assert.match(sql, /set search_path\s*=\s*public/i)
    assert.match(sql, /grant execute on function public\.performance_aggregate[\s\S]*service_role/i)
    assert.match(sql, /revoke all on function public\.performance_aggregate[\s\S]*anon,\s*authenticated/i)
  })

  it("filters archived jobs and uses UTC created dates", () => {
    assert.match(sql, /archived_at is null/i)
    assert.match(sql, /date_created at time zone 'UTC'/i)
  })
})

describe("performance service wiring", () => {
  it("prefers SQL aggregate RPC on Supabase with slim-row fallback", () => {
    assert.match(serviceSrc, /findPerformanceAggregate/)
    assert.match(serviceSrc, /performance\.aggregate_rpc_fallback/)
    assert.match(serviceSrc, /aggregate_slim_rows/)
  })

  it("export requests includeJobs; page path defaults to omit jobs", () => {
    assert.match(exportSrc, /includeJobs:\s*true/)
    assert.match(serviceSrc, /includeJobs = opts\.includeJobs === true/)
  })
})

describe("golden aggregatePerformancePayloadFromData", () => {
  it("handles empty jobs", () => {
    const payload = aggregatePerformancePayloadFromData({
      jobsRaw: [],
      clients,
      users,
      filters: baseFilters,
      period,
    })
    assert.equal(payload.kpis.find(k => k.key === "total-created")?.value, 0)
    assert.equal(payload.jobs.length, 0)
    assert.equal(payload.revisionAnalytics.totalRevisions, 0)
  })

  it("counts originals and revisions independently (no current-work overlay)", () => {
    const payload = aggregatePerformancePayloadFromData({
      jobsRaw: [
        job({ id: "orig", status: "ISSUED", dateCreated: "2026-07-02T00:00:00.000Z", dateCompleted: "2026-07-03" }),
        job({
          id: "rev-a",
          parentJobId: "orig",
          drawingNumber: "26/ORYX/01/001 Rev A",
          status: "IN_DESIGN",
          dateCreated: "2026-07-08T00:00:00.000Z",
          dateCompleted: null,
        }),
        job({
          id: "rev-b",
          parentJobId: "orig",
          drawingNumber: "26/ORYX/01/001 Rev B",
          status: "ISSUED",
          dateCreated: "2026-07-12T00:00:00.000Z",
          dateCompleted: "2026-07-14",
          itemType: "REVISION",
        }),
      ],
      clients,
      users,
      filters: baseFilters,
      period,
    })
    assert.equal(payload.kpis.find(k => k.key === "total-created")?.value, 3)
    assert.equal(payload.revisionAnalytics.totalRevisions, 2)
    assert.equal(payload.revisionAnalytics.averageRevisionsPerJob, 2)
    assert.equal(payload.workloadAnalytics.currentWorkload, 1)
  })

  it("applies designer / client / status / tag / type filters exactly", () => {
    const jobsRaw = [
      job({ id: "a", designer: "Priya Shah", clientId: "c1", status: "ISSUED", tags: ["CAT II"], itemType: "DESIGN" }),
      job({ id: "b", designer: "Other", clientId: "c2", status: "IN_DESIGN", tags: ["urgent"], itemType: "SITE_VISIT" }),
    ]
    const filtered = applyPerformanceFilters(performanceRowsFromRawJobs(jobsRaw), {
      ...baseFilters,
      engineer: "Priya Shah",
      clientId: "c1",
      status: "ISSUED",
      tag: "CAT II",
      jobType: "DESIGN",
    })
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, "a")
  })

  it("uses createdDate for period membership and completedDate for completion KPIs", () => {
    const payload = aggregatePerformancePayloadFromData({
      jobsRaw: [
        job({
          id: "old",
          dateCreated: "2026-06-01T00:00:00.000Z",
          dateCompleted: "2026-07-20",
          status: "ISSUED",
        }),
        job({
          id: "new",
          dateCreated: "2026-07-05T00:00:00.000Z",
          dateCompleted: "2026-07-06",
          status: "ISSUED",
        }),
      ],
      clients,
      users,
      filters: baseFilters,
      period,
    })
    assert.equal(payload.kpis.find(k => k.key === "total-created")?.value, 1)
    assert.equal(payload.kpis.find(k => k.key === "total-completed")?.value, 1)
    // completed-this-month counts ALL filtered ISSUED with completedDate in month of period.to
    assert.equal(payload.kpis.find(k => k.key === "completed-this-month")?.value, 2)
  })

  it("maps empty designer to Unassigned and builds previous period of equal span", () => {
    const [row] = performanceRowsFromRawJobs([job({ designer: "" })])
    assert.equal(row.designer, "Unassigned")
    assert.deepEqual(getPreviousPeriod(period), { from: "2026-05-31", to: "2026-06-30" })
  })

  it("can omit jobs array for SQL page path while keeping KPI math", () => {
    const payload = aggregatePerformancePayloadFromData({
      jobsRaw: [job({})],
      clients,
      users,
      filters: baseFilters,
      period,
      includeJobs: false,
    })
    assert.equal(payload.jobs.length, 0)
    assert.equal(payload.kpis.find(k => k.key === "total-created")?.value, 1)
  })

  it("scale metric: Node path transfers one row per job; SQL path transfers aggregate object", () => {
    const jobsRaw = Array.from({ length: 500 }, (_, i) =>
      job({
        id: `j${i}`,
        dateCreated: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
        status: i % 3 === 0 ? "ISSUED" : "IN_DESIGN",
        dateCompleted: i % 3 === 0 ? "2026-07-28" : null,
        clientId: i % 2 === 0 ? "c1" : "c2",
      }),
    )
    const transferred = countPerformanceJobRowsTransferred(jobsRaw)
    assert.equal(transferred, 500)
    const payload = aggregatePerformancePayloadFromData({
      jobsRaw,
      clients,
      users,
      filters: baseFilters,
      period,
      includeJobs: false,
    })
    // Compact aggregate surfaces — not O(jobs)
    assert.ok(payload.kpis.length < 20)
    assert.ok(payload.engineerRows.length <= users.length + 5)
    assert.ok(payload.topClients.length <= 12)
    assert.equal(payload.jobs.length, 0)
  })

  it("handles boundary dates, nulls, zero-value completion, cancelled-like ISSUED/active mix", () => {
    const payload = aggregatePerformancePayloadFromData({
      jobsRaw: [
        job({
          id: "on-start",
          dateCreated: "2026-07-01T00:00:00.000Z",
          status: "NEW_REQUEST",
          dateCompleted: null,
          requiredByDate: null,
          clientId: null,
        }),
        job({
          id: "on-end",
          dateCreated: "2026-07-31T23:00:00.000Z",
          status: "ISSUED",
          dateCompleted: "2026-07-31",
          itemType: "SITE_VISIT",
        }),
        job({
          id: "outside",
          dateCreated: "2026-08-01T00:00:00.000Z",
          status: "CHECKING",
        }),
      ],
      clients,
      users,
      filters: baseFilters,
      period,
    })
    assert.equal(payload.kpis.find(k => k.key === "total-created")?.value, 2)
    assert.equal(payload.kpis.find(k => k.key === "site-visits-completed")?.value, 1)
    assert.equal(payload.jobsByStatus.find(s => s.status === "CHECKING")?.count, 1)
  })
})
