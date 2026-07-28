"use client"

import { useState } from "react"
import { ArrowDown, ArrowUp, Download, Filter } from "lucide-react"
import { RequireRole } from "@/components/require-role"
import { buildApiKey, useApi } from "@/shared/hooks/use-api"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/utils"
import { DetailPanel, KpiTile, PageHeader, PageShell, surfaceCard } from "@/shared/layouts/page-layout"
import type { ChartPoint, PerformancePayload } from "../types"

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
  const apiKey = buildApiKey("/api/performance", { from, to, engineer, clientId, jobType, tag, status })
  const { data, error, isLoading } = useApi<PerformancePayload>(apiKey)

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
          <select className="h-9 rounded-lg border border-bd bg-sr px-3 text-sm text-t2" value={engineer} onChange={e => setEngineer(e.target.value)}>
            <option value="all">All engineers</option>
            {data?.filterOptions.engineers.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-bd bg-sr px-3 text-sm text-t2" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="all">All clients</option>
            {data?.filterOptions.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-bd bg-sr px-3 text-sm text-t2" value={jobType} onChange={e => setJobType(e.target.value)}>
            <option value="all">All job types</option>
            {data?.filterOptions.jobTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-bd bg-sr px-3 text-sm text-t2" value={tag} onChange={e => setTag(e.target.value)}>
            <option value="all">All tags</option>
            {data?.filterOptions.tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-bd bg-sr px-3 text-sm text-t2" value={status} onChange={e => setStatus(e.target.value)}>
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
        <SingleBars
          title="Jobs by Status"
          points={(data?.jobsByStatus ?? []).map(s => ({ key: s.status, label: s.label, value: s.count }))}
          color="bg-wn"
        />
        <SingleBars title="Engineer Comparison (completed)" points={data?.engineerComparison ?? []} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <DetailPanel title="Top Clients by Jobs">
          <div className="space-y-2">
            {data?.topClients.map(client => (
              <div key={client.clientId} className="w-full rounded border border-bd p-2 text-left">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-t1">{client.clientName}</span>
                  <span className="font-mono text-t2">{client.jobsInPeriod} period / {client.totalJobs} total</span>
                </div>
              </div>
            ))}
          </div>
        </DetailPanel>
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MetricList title="Time Analytics" items={[
          ["Average turnaround (days)", data?.timeAnalytics.averageDesignTurnaroundDays ?? 0],
          ["Median turnaround (days)", data?.timeAnalytics.medianTurnaroundDays ?? 0],
          ["Fastest completion (days)", data?.timeAnalytics.fastestCompletionDays ?? 0],
          ["Longest completion (days)", data?.timeAnalytics.longestCompletionDays ?? 0],
          ["Avg waiting for client info (days)", data?.timeAnalytics.averageDaysWaitingForClientInformation ?? 0],
        ]} />
      </div>
    </PageShell>
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
