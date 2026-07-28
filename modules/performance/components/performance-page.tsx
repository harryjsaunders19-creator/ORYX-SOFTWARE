"use client"

import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Filter } from "lucide-react"
import { RequireRole } from "@/components/require-role"
import { buildApiKey, useApi } from "@/shared/hooks/use-api"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/utils"
import { DetailPanel, KpiTile, PageHeader, PageShell, surfaceCard } from "@/shared/layouts/page-layout"
import type { ChartPoint, PerformanceEngineerRow, PerformanceJobRow, PerformancePayload } from "../types"

type EngineerSortKey = keyof Pick<
  PerformanceEngineerRow,
  "name" | "jobsCompleted" | "jobsAssigned" | "avgTurnaroundDays" | "avgRevisionsPerJob" | "siteVisitsCompleted" | "awaitingChecking" | "avgJobsPerWeek"
>

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[11px] text-t4">No baseline</span>
  const up = pct >= 0
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", up ? "text-ok-tx" : "text-er")}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function CompareBars({
  title,
  points,
  leftLabel = "Created",
  rightLabel = "Completed",
  onSelect,
}: {
  title: string
  points: ChartPoint[]
  leftLabel?: string
  rightLabel?: string
  onSelect?: (label: string) => void
}) {
  const max = Math.max(1, ...points.flatMap(p => [p.value, p.valueB ?? 0]))
  return (
    <DetailPanel title={title}>
      <div className="space-y-2">
        <div className="flex items-center gap-4 text-[11px] text-t4">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ac" />{leftLabel}</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok-ic" />{rightLabel}</span>
        </div>
        <div className="space-y-2">
          {points.map(point => (
            <button
              key={point.key}
              type="button"
              onClick={() => onSelect?.(point.label)}
              className="w-full text-left rounded border border-bd p-2 hover:bg-pg/40"
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-t3">{point.label}</span>
                <span className="font-mono text-t2">{point.value} / {point.valueB ?? 0}</span>
              </div>
              <div className="h-2 rounded bg-pg overflow-hidden">
                <div className="h-full bg-ac" style={{ width: `${(point.value / max) * 100}%` }} />
              </div>
              <div className="mt-1 h-2 rounded bg-pg overflow-hidden">
                <div className="h-full bg-ok-ic" style={{ width: `${((point.valueB ?? 0) / max) * 100}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </DetailPanel>
  )
}

function SingleBars({
  title,
  points,
  color = "bg-ac",
  onSelect,
}: {
  title: string
  points: ChartPoint[]
  color?: string
  onSelect?: (label: string) => void
}) {
  const max = Math.max(1, ...points.map(p => p.value))
  return (
    <DetailPanel title={title}>
      <div className="space-y-2">
        {points.map(point => (
          <button
            key={point.key}
            type="button"
            onClick={() => onSelect?.(point.label)}
            className="w-full text-left rounded border border-bd p-2 hover:bg-pg/40"
          >
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-t3">{point.label}</span>
              <span className="font-mono text-t2">{point.value}</span>
            </div>
            <div className="h-2 rounded bg-pg overflow-hidden">
              <div className={cn("h-full", color)} style={{ width: `${(point.value / max) * 100}%` }} />
            </div>
          </button>
        ))}
      </div>
    </DetailPanel>
  )
}

function PerformancePageInner() {
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 7) + "-01")
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [engineer, setEngineer] = useState("all")
  const [clientId, setClientId] = useState("all")
  const [jobType, setJobType] = useState("all")
  const [tag, setTag] = useState("all")
  const [status, setStatus] = useState("all")
  const [sortKey, setSortKey] = useState<EngineerSortKey>("jobsCompleted")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [drill, setDrill] = useState<{ kind: string; value: string } | null>(null)
  const apiKey = buildApiKey("/api/performance", { from, to, engineer, clientId, jobType, tag, status })
  const { data, error, isLoading } = useApi<PerformancePayload>(apiKey)

  const engineerRows = useMemo(() => {
    const rows = [...(data?.engineerRows ?? [])]
    const dir = sortDir === "asc" ? 1 : -1
    return rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir || a.name.localeCompare(b.name)
      return String(av).localeCompare(String(bv)) * dir || a.name.localeCompare(b.name)
    })
  }, [data?.engineerRows, sortDir, sortKey])

  const drillRows = useMemo(() => {
    const jobs = data?.jobs ?? []
    if (!drill) return jobs.slice(0, 60)
    if (drill.kind === "status") return jobs.filter(j => j.status === drill.value).slice(0, 120)
    if (drill.kind === "engineer") return jobs.filter(j => j.designer === drill.value).slice(0, 120)
    if (drill.kind === "client") return jobs.filter(j => j.clientCompany === drill.value).slice(0, 120)
    return jobs.slice(0, 120)
  }, [data?.jobs, drill])

  function toggleSort(next: EngineerSortKey) {
    if (sortKey === next) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(next)
      setSortDir(next === "name" ? "asc" : "desc")
    }
  }

  async function exportFile(format: "csv" | "xlsx" | "pdf") {
    const url = buildApiKey("/api/performance/export", { format, from, to, engineer, clientId, jobType, tag, status })
    const res = await fetch(url)
    if (!res.ok) return
    const blob = await res.blob()
    const cd = res.headers.get("Content-Disposition") ?? ""
    const name = cd.match(/filename="?([^"]+)"?/)?.[1] ?? `performance.${format}`
    const href = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = href
    a.download = name
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <PageShell wide className="space-y-5">
      <PageHeader
        title="Performance & Analytics"
        description="Operational intelligence across jobs, engineers, clients, revisions, workload, and turnaround."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => exportFile("csv")}><Download className="h-3.5 w-3.5" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => exportFile("xlsx")}><Download className="h-3.5 w-3.5" /> Excel</Button>
            <Button size="sm" variant="outline" onClick={() => exportFile("pdf")}><Download className="h-3.5 w-3.5" /> PDF summary</Button>
          </>
        }
      />

      <div className={cn(surfaceCard, "p-3 md:p-4")}>
        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-t3"><Filter className="h-3.5 w-3.5" /> Filters</div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          <select className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t2" value={engineer} onChange={e => setEngineer(e.target.value)}>
            <option value="all">All engineers</option>
            {data?.filterOptions.engineers.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <select className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t2" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="all">All clients</option>
            {data?.filterOptions.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t2" value={jobType} onChange={e => setJobType(e.target.value)}>
            <option value="all">All job types</option>
            {data?.filterOptions.jobTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t2" value={tag} onChange={e => setTag(e.target.value)}>
            <option value="all">All tags</option>
            {data?.filterOptions.tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="h-10 rounded border border-bd bg-sr px-3 text-sm text-t2" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All status</option>
            {data?.filterOptions.statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-er">{error instanceof Error ? error.message : "Failed to load analytics"}</p>}
      {isLoading && <p className="text-sm text-t3">Loading analytics…</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data?.kpis.map(metric => (
          <KpiTile
            key={metric.key}
            label={metric.label}
            value={metric.value}
            sub={<span className="flex items-center justify-between"><span>{metric.previousValue} prev</span><TrendBadge pct={metric.deltaPct} /></span>}
            className="p-4"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <CompareBars title="Jobs by Month (Created vs Completed)" points={data?.jobsByMonth ?? []} onSelect={value => setDrill({ kind: "month", value })} />
        <CompareBars title="Jobs by Week (Created vs Completed)" points={data?.jobsByWeek ?? []} onSelect={value => setDrill({ kind: "week", value })} />
        <CompareBars title="Jobs by Day (Created vs Completed)" points={data?.jobsByDay ?? []} onSelect={value => setDrill({ kind: "day", value })} />
        <SingleBars
          title="Jobs by Status"
          points={(data?.jobsByStatus ?? []).map(s => ({ key: s.status, label: s.label, value: s.count }))}
          color="bg-wn"
          onSelect={value => setDrill({ kind: "status", value: data?.jobsByStatus.find(s => s.label === value)?.status ?? value })}
        />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-4">
        <div className="2xl:col-span-2">
          <DetailPanel title="Engineer Performance">
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-t3 border-b border-bd">
                    <SortTh label="Engineer" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                    <SortTh label="Completed" active={sortKey === "jobsCompleted"} dir={sortDir} onClick={() => toggleSort("jobsCompleted")} align="right" />
                    <SortTh label="Assigned" active={sortKey === "jobsAssigned"} dir={sortDir} onClick={() => toggleSort("jobsAssigned")} align="right" />
                    <SortTh label="Avg turnaround" active={sortKey === "avgTurnaroundDays"} dir={sortDir} onClick={() => toggleSort("avgTurnaroundDays")} align="right" />
                    <SortTh label="Avg revisions" active={sortKey === "avgRevisionsPerJob"} dir={sortDir} onClick={() => toggleSort("avgRevisionsPerJob")} align="right" />
                    <SortTh label="Site visits" active={sortKey === "siteVisitsCompleted"} dir={sortDir} onClick={() => toggleSort("siteVisitsCompleted")} align="right" />
                    <SortTh label="Checking" active={sortKey === "awaitingChecking"} dir={sortDir} onClick={() => toggleSort("awaitingChecking")} align="right" />
                    <SortTh label="Avg / week" active={sortKey === "avgJobsPerWeek"} dir={sortDir} onClick={() => toggleSort("avgJobsPerWeek")} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {engineerRows.map(row => (
                    <tr key={row.userId} className="border-b border-bd/70 hover:bg-pg/40">
                      <td className="py-2.5 font-medium text-t1">
                        <button type="button" className="hover:text-ac" onClick={() => setDrill({ kind: "engineer", value: row.name })}>{row.name}</button>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{row.jobsCompleted}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.jobsAssigned}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.avgTurnaroundDays}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.avgRevisionsPerJob}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.siteVisitsCompleted}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.awaitingChecking}</td>
                      <td className="py-2.5 text-right tabular-nums">{row.avgJobsPerWeek}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailPanel>
        </div>
        <SingleBars title="Engineer Comparison (completed)" points={data?.engineerComparison ?? []} onSelect={value => setDrill({ kind: "engineer", value })} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DetailPanel title="Top Clients by Jobs">
          <div className="space-y-2">
            {data?.topClients.map(client => (
              <button key={client.clientId} className="w-full rounded border border-bd p-2 text-left hover:bg-pg/40" onClick={() => setDrill({ kind: "client", value: client.clientName })}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-t1">{client.clientName}</span>
                  <span className="font-mono text-t2">{client.jobsInPeriod} period / {client.totalJobs} total</span>
                </div>
              </button>
            ))}
          </div>
        </DetailPanel>
        <DetailPanel title="Clients with no work in last 6 months">
          <div className="max-h-[280px] overflow-auto space-y-2">
            {data?.inactiveClients.length ? data.inactiveClients.map(client => (
              <div key={client.clientId} className="rounded border border-bd px-3 py-2 text-sm">
                <div className="font-medium text-t1">{client.clientName}</div>
                <div className="text-xs text-t4">Last job: {client.lastJobDate ?? "Never"}</div>
              </div>
            )) : <p className="text-sm text-t3">No inactive clients detected.</p>}
          </div>
        </DetailPanel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <MetricList title="Revision Analytics" items={[
          ["Total revisions", data?.revisionAnalytics.totalRevisions ?? 0],
          ["Avg revisions per job", data?.revisionAnalytics.averageRevisionsPerJob ?? 0],
          ["Jobs with multiple revisions", data?.revisionAnalytics.jobsRequiringMultipleRevisions ?? 0],
          ["Most common revision count", data?.revisionAnalytics.mostCommonRevisionCount ?? 0],
        ]} />
        <MetricList title="Workload Analytics" items={[
          ["Jobs created", data?.workloadAnalytics.jobsCreated ?? 0],
          ["Jobs completed", data?.workloadAnalytics.jobsCompleted ?? 0],
          ["Current workload", data?.workloadAnalytics.currentWorkload ?? 0],
          ["Outstanding jobs", data?.workloadAnalytics.outstandingJobs ?? 0],
          ["Avg age of active jobs (days)", data?.workloadAnalytics.averageAgeOfActiveJobs ?? 0],
          ["Jobs overdue", data?.workloadAnalytics.overdueJobs ?? 0],
          ["Due this week", data?.workloadAnalytics.dueThisWeek ?? 0],
          ["Due next week", data?.workloadAnalytics.dueNextWeek ?? 0],
        ]} />
        <MetricList title="Time Analytics" items={[
          ["Average turnaround (days)", data?.timeAnalytics.averageDesignTurnaroundDays ?? 0],
          ["Median turnaround (days)", data?.timeAnalytics.medianTurnaroundDays ?? 0],
          ["Fastest completion (days)", data?.timeAnalytics.fastestCompletionDays ?? 0],
          ["Longest completion (days)", data?.timeAnalytics.longestCompletionDays ?? 0],
          ["Avg waiting for client info (days)", data?.timeAnalytics.averageDaysWaitingForClientInformation ?? 0],
        ]} />
      </div>

      <DetailPanel
        title={drill ? `Drill-down jobs (${drill.kind}: ${drill.value})` : "Drill-down jobs"}
        headerAction={drill ? <Button size="sm" variant="ghost" onClick={() => setDrill(null)}>Clear</Button> : undefined}
      >
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-t3 border-b border-bd">
                <th className="py-2 text-left">Job</th>
                <th className="py-2 text-left">Client</th>
                <th className="py-2 text-left">Engineer</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Created</th>
                <th className="py-2 text-left">Completed</th>
              </tr>
            </thead>
            <tbody>
              {drillRows.map((job: PerformanceJobRow) => (
                <tr key={job.id} className="border-b border-bd/70">
                  <td className="py-2"><a className="text-ac hover:text-ach" href={`/jobs/${job.id}`}>{job.drawingNumber}</a></td>
                  <td className="py-2">{job.clientCompany}</td>
                  <td className="py-2">{job.designer}</td>
                  <td className="py-2">{job.status}</td>
                  <td className="py-2">{job.itemType}</td>
                  <td className="py-2">{job.createdDate}</td>
                  <td className="py-2">{job.completedDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailPanel>
    </PageShell>
  )
}

function SortTh({
  label,
  active,
  dir,
  onClick,
  align,
}: {
  label: string
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
  align?: "right"
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th className={cn("py-2 text-left", align === "right" && "text-right")}>
      <button type="button" className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")} onClick={onClick}>
        {label}
        <Icon className="h-3.5 w-3.5 text-t4" />
      </button>
    </th>
  )
}

function MetricList({ title, items }: { title: string; items: [string, number][] }) {
  return (
    <DetailPanel title={title}>
      <dl className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex justify-between text-sm border-b border-bd/60 pb-1.5">
            <dt className="text-t3">{label}</dt>
            <dd className="font-mono text-t1">{value}</dd>
          </div>
        ))}
      </dl>
    </DetailPanel>
  )
}

export default function PerformancePage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <PerformancePageInner />
    </RequireRole>
  )
}
