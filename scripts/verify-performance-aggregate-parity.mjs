#!/usr/bin/env node
/**
 * Parity check: Node golden aggregator vs migration 048 performance_aggregate on PGlite.
 *
 * Usage: node --import tsx scripts/verify-performance-aggregate-parity.mjs
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { execSync } from "node:child_process"
import { aggregatePerformancePayloadFromData } from "../modules/performance/lib/aggregate-performance.ts"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const dir = mkdtempSync(join(tmpdir(), "oryx-perf-agg-"))

function sh(cmd) {
  execSync(cmd, { cwd: dir, stdio: "inherit" })
}

sh("npm init -y >/dev/null 2>&1")
sh("npm install @electric-sql/pglite --no-save --silent")

const { PGlite } = await import(pathToFileURL(join(dir, "node_modules/@electric-sql/pglite/dist/index.js")).href)

const migration = readFileSync(join(root, "supabase/migrations/048_performance_aggregate.sql"), "utf8")

const db = new PGlite()
await db.exec(`
do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null;
end $$;
create table public.clients (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.app_users (
  id text primary key,
  name text not null,
  role text not null default 'ENGINEER',
  active boolean not null default true
);
create table public.jobs (
  id text primary key,
  drawing_number text not null,
  item_type text not null default 'DESIGN',
  status text not null,
  designer text not null default '',
  client_id text references public.clients(id),
  client_company text not null default '',
  tags text[] default '{}',
  date_created timestamptz not null,
  date_completed date,
  required_by_date date,
  requested_date date,
  parent_job_id text,
  archived_at timestamptz
);
`)
await db.exec(migration)

const users = [
  { id: "u1", name: "Priya Shah", role: "ENGINEER", active: 1 },
  { id: "u2", name: "Admin User", role: "ADMIN", active: 1 },
]
const clients = [
  { id: "c1", name: "Acme Scaffolding", createdAt: "2026-07-05T10:00:00.000Z", active: 1 },
  { id: "c2", name: "Beta Ltd", createdAt: "2025-01-01T10:00:00.000Z", active: 1 },
]

await db.exec(`
insert into app_users(id,name,role,active) values
  ('u1','Priya Shah','ENGINEER',true),
  ('u2','Admin User','ADMIN',true);
insert into clients(id,name,active,created_at) values
  ('c1','Acme Scaffolding',true,'2026-07-05T10:00:00Z'),
  ('c2','Beta Ltd',true,'2025-01-01T10:00:00Z');
`)

const jobsRaw = [
  {
    id: "orig",
    drawingNumber: "26/ORYX/01/001",
    clientId: "c1",
    clientCompany: "Acme",
    designer: "Priya Shah",
    status: "ISSUED",
    itemType: "DESIGN",
    tags: ["CAT II"],
    dateCreated: "2026-07-02T12:00:00.000Z",
    dateCompleted: "2026-07-05",
    requiredByDate: "2026-07-10",
    requestedDate: "2026-07-01",
    parentJobId: null,
  },
  {
    id: "rev-a",
    drawingNumber: "26/ORYX/01/001 Rev A",
    clientId: "c1",
    clientCompany: "Acme",
    designer: "Priya Shah",
    status: "IN_DESIGN",
    itemType: "REVISION",
    tags: ["CAT II"],
    dateCreated: "2026-07-08T12:00:00.000Z",
    dateCompleted: null,
    requiredByDate: "2026-07-01",
    requestedDate: null,
    parentJobId: "orig",
  },
  {
    id: "rev-b",
    drawingNumber: "26/ORYX/01/001 Rev B",
    clientId: "c1",
    clientCompany: "Acme",
    designer: "Ghost Designer",
    status: "ISSUED",
    itemType: "REVISION",
    tags: [],
    dateCreated: "2026-07-12T12:00:00.000Z",
    dateCompleted: "2026-07-14",
    requiredByDate: null,
    requestedDate: null,
    parentJobId: "orig",
  },
  {
    id: "site",
    drawingNumber: "SV-1",
    clientId: "c2",
    clientCompany: "Beta",
    designer: "Priya Shah",
    status: "ISSUED",
    itemType: "SITE_VISIT",
    tags: ["urgent"],
    dateCreated: "2026-07-20T12:00:00.000Z",
    dateCompleted: "2026-07-21",
    requiredByDate: "2026-07-22",
    requestedDate: null,
    parentJobId: null,
  },
  {
    id: "archived",
    drawingNumber: "ARCH-1",
    clientId: "c1",
    clientCompany: "Acme",
    designer: "Priya Shah",
    status: "ISSUED",
    itemType: "DESIGN",
    tags: [],
    dateCreated: "2026-07-15T12:00:00.000Z",
    dateCompleted: "2026-07-16",
    requiredByDate: null,
    requestedDate: null,
    parentJobId: null,
  },
]

for (const j of jobsRaw) {
  await db.query(
    `insert into jobs(id,drawing_number,item_type,status,designer,client_id,client_company,tags,date_created,date_completed,required_by_date,requested_date,parent_job_id,archived_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      j.id,
      j.drawingNumber,
      j.itemType,
      j.status,
      j.designer,
      j.clientId,
      j.clientCompany,
      j.tags,
      j.dateCreated,
      j.dateCompleted,
      j.requiredByDate,
      j.requestedDate,
      j.parentJobId,
      j.id === "archived" ? "2026-07-30T00:00:00Z" : null,
    ],
  )
}

const period = { from: "2026-07-01", to: "2026-07-31" }
const filters = {
  from: period.from,
  to: period.to,
  engineer: "all",
  clientId: "all",
  jobType: "all",
  tag: "all",
  status: "all",
}

const nodePayload = aggregatePerformancePayloadFromData({
  jobsRaw: jobsRaw.filter(j => j.id !== "archived"),
  clients,
  users,
  filters,
  period,
  includeJobs: false,
})

const sqlRes = await db.query(
  `select public.performance_aggregate($1::date,$2::date,null,null,null,null,null) as payload`,
  [period.from, period.to],
)
const sqlPayload = sqlRes.rows[0].payload

function pickComparable(p) {
  return {
    kpis: p.kpis,
    jobsByMonth: p.jobsByMonth,
    jobsByWeek: p.jobsByWeek,
    jobsByStatus: p.jobsByStatus,
    engineerComparison: p.engineerComparison,
    topClients: p.topClients.map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      totalJobs: c.totalJobs,
      jobsInPeriod: c.jobsInPeriod,
      lastJobDate: c.lastJobDate,
      isNewThisMonth: c.isNewThisMonth,
      monthlyPoints: c.monthlyPoints,
    })),
    newClientsInPeriod: p.newClientsInPeriod,
    revisionAnalytics: p.revisionAnalytics,
    workloadAnalytics: p.workloadAnalytics,
    timeAnalytics: p.timeAnalytics,
    engineerRows: p.engineerRows.map(e => ({
      userId: e.userId,
      name: e.name,
      role: e.role,
      fromDirectory: e.fromDirectory,
      jobsCompleted: e.jobsCompleted,
      jobsAssigned: e.jobsAssigned,
      avgTurnaroundDays: e.avgTurnaroundDays,
      avgRevisionsPerJob: e.avgRevisionsPerJob,
      siteVisitsCompleted: e.siteVisitsCompleted,
      awaitingChecking: e.awaitingChecking,
      avgJobsPerWeek: e.avgJobsPerWeek,
      completionTrend: e.completionTrend,
    })),
  }
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])]))
  }
  return v
}

const a = sortKeys(pickComparable(nodePayload))
const b = sortKeys(pickComparable(sqlPayload))
writeFileSync("/tmp/perf-parity-node.json", JSON.stringify(a, null, 2))
writeFileSync("/tmp/perf-parity-sql.json", JSON.stringify(b, null, 2))

if (JSON.stringify(a) !== JSON.stringify(b)) {
  console.error("PARITY MISMATCH — see /tmp/perf-parity-node.json vs /tmp/perf-parity-sql.json")
  process.exit(1)
}

const many = []
for (let i = 0; i < 2000; i++) {
  many.push({
    status: i % 4 === 0 ? "ISSUED" : "IN_DESIGN",
    clientId: i % 2 ? "c1" : "c2",
    dateCreated: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    dateCompleted: i % 4 === 0 ? "2026-07-28" : null,
  })
}
for (let bIdx = 0; bIdx < many.length; bIdx += 200) {
  const chunk = many.slice(bIdx, bIdx + 200)
  const values = chunk
    .map(
      (j, idx) =>
        `('bulk${bIdx + idx}','DN-${bIdx + idx}','DESIGN','${j.status}','Priya Shah','${j.clientId}','X','{}','${j.dateCreated}'::timestamptz,${
          j.dateCompleted ? `'${j.dateCompleted}'::date` : "null"
        },null,null,null,null)`,
    )
    .join(",")
  await db.exec(
    `insert into jobs(id,drawing_number,item_type,status,designer,client_id,client_company,tags,date_created,date_completed,required_by_date,requested_date,parent_job_id,archived_at) values ${values}`,
  )
}
const scale = await db.query(
  `select public.performance_aggregate('2026-07-01'::date,'2026-07-31'::date,null,null,null,null,null) as payload`,
)
const scaled = scale.rows[0].payload
const aggregateRowsApprox =
  (scaled.kpis?.length ?? 0)
  + (scaled.jobsByMonth?.length ?? 0)
  + (scaled.engineerRows?.length ?? 0)
  + (scaled.topClients?.length ?? 0)
  + (scaled.jobsByStatus?.length ?? 0)

console.log(
  JSON.stringify(
    {
      parity: "ok",
      fixtureJobsNonArchived: 4,
      scaleJobsNonArchivedApprox: 2004,
      oldPathRowsTransferred: 2004,
      newPathAggregateElements: aggregateRowsApprox,
    },
    null,
    2,
  ),
)

await db.close()
rmSync(dir, { recursive: true, force: true })
