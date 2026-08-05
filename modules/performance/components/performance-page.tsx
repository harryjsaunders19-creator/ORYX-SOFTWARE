"use client"

import { useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Calendar,
  Clock,
  Download,
  Info,
  Activity,
} from "lucide-react"
import { RequireRole } from "@/components/require-role"
import { buildApiKey, useApi } from "@/shared/hooks/use-api"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/utils"
import { PageShell } from "@/shared/layouts/page-layout"
import { Typography } from "@/shared/design/typography"
import { ListSkeleton } from "@/shared/ui/list-skeleton"
import type { ChartPoint, KpiMetric, PerformancePayload } from "../types"

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className={cn(Typography.Helper, "text-t3 bg-surface-low px-1 rounded")}>
        No baseline
      </span>
    )
  }
  const up = pct >= 0
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5",
        Typography.Helper,
        up ? "text-ok-tx" : "text-dn",
      )}
    >
      {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function DataCard({
  children,
  className,
  hover = true,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div
      className={cn(
        "bg-sr border border-bd rounded-lg transition-colors",
        hover && "hover:border-t1",
        className,
      )}
    >
      {children}
    </div>
  )
}

function findKpi(kpis: KpiMetric[] | undefined, key: string): KpiMetric | undefined {
  return kpis?.find(k => k.key === key)
}

function setLast30Days(setFrom: (v: string) => void, setTo: (v: string) => void) {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - 29)
  setTo(to.toISOString().slice(0, 10))
  setFrom(from.toISOString().slice(0, 10))
}

function HeroKpi({
  label,
  value,
  unit,
  badge,
  barPct,
}: {
  label: string
  value: string | number
  unit?: string
  badge: ReactNode
  barPct: number
}) {
  const width = Math.max(0, Math.min(100, barPct))
  return (
    <DataCard className="p-6">
      <p className={cn(Typography.Helper, "uppercase tracking-widest text-t3")}>{label}</p>
      <div className="flex items-end justify-between mt-4 gap-3">
        <div className="flex items-baseline gap-1 min-w-0">
          <h2 className={cn(Typography.PageTitle, "leading-none tabular-nums")}>{value}</h2>
          {unit ? (
            <span className={cn(Typography.Helper, "text-t3")}>{unit}</span>
          ) : null}
        </div>
        <div className="text-right shrink-0">{badge}</div>
      </div>
      <div className="w-full h-1 bg-surface-low mt-6 overflow-hidden">
        <div className="h-full bg-ac transition-[width] duration-300" style={{ width: `${width}%` }} />
      </div>
    </DataCard>
  )
}

function StatusBars({ points }: { points: ChartPoint[] }) {
  const max = Math.max(1, ...points.map(p => p.value))
  if (points.length === 0) {
    return <p className={cn(Typography.Small, "text-t3")}>No status data for this period.</p>
  }
  return (
    <div className="space-y-6">
      {points.map((point, idx) => {
        const pct = (point.value / max) * 100
        return (
          <div
            key={point.key}
            className={cn("space-y-2", point.value === 0 && "opacity-40")}
          >
            <div className={cn(Typography.Helper, "flex justify-between")}>
              <span className="text-t1">{point.label}</span>
              <span className="tabular-nums text-t1">{point.value}</span>
            </div>
            <div className="w-full h-3 bg-surface-low overflow-hidden">
              <div
                className={cn("h-full bg-ac transition-[width]", idx === 0 && "bg-t1")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EngineerTable({
  rows,
}: {
  rows: Array<{
    key: string
    name: string
    completed: number
    productivity: number
  }>
}) {
  const max = Math.max(1, ...rows.map(r => r.completed))
  if (rows.length === 0) {
    return (
      <p className={cn(Typography.Small, "text-t3 px-6 py-8")}>
        No engineer completions in this period.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-surface-low border-b border-bd">
          <tr>
            <th className={cn(Typography.Helper, "px-6 py-3 font-medium uppercase tracking-tighter text-t3")}>
              Engineer
            </th>
            <th className={cn(Typography.Helper, "px-6 py-3 font-medium uppercase tracking-tighter text-t3")}>
              Completed Jobs
            </th>
            <th
              className={cn(
                Typography.Helper,
                "px-6 py-3 font-medium uppercase tracking-tighter text-t3 text-right",
              )}
            >
              Productivity Index
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bd">
          {rows.map((row, i) => (
            <tr key={row.key} className="hover:bg-surface-low transition-colors">
              <td className={cn(Typography.Small, "px-6 py-4", i === 0 ? "font-bold text-t1" : "text-t1")}>
                {row.name}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-2 bg-surface-low rounded-full max-w-[200px] overflow-hidden">
                    <div
                      className="h-full bg-ac rounded-full"
                      style={{ width: `${(row.completed / max) * 100}%` }}
                    />
                  </div>
                  <span className={cn(Typography.Small, "tabular-nums text-t1")}>{row.completed}</span>
                </div>
              </td>
              <td className={cn(Typography.Small, "px-6 py-4 text-right tabular-nums text-t1")}>
                {row.productivity.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MetricCard({
  title,
  icon,
  items,
}: {
  title: string
  icon: React.ReactNode
  items: Array<{ label: string; value: ReactNode; danger?: boolean }>
}) {
  return (
    <DataCard className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-t1">{icon}</span>
        <h3 className={cn(Typography.Helper, "font-bold uppercase tracking-widest text-t1")}>
          {title}
        </h3>
      </div>
      <ul className="space-y-0">
        {items.map((item, i) => (
          <li
            key={item.label}
            className={cn(
              "flex justify-between items-center py-2",
              i < items.length - 1 && "border-b border-bd",
            )}
          >
            <span className={cn(Typography.Small, "text-t3")}>{item.label}</span>
            <span
              className={cn(
                Typography.Small,
                "font-bold tabular-nums",
                item.danger ? "text-dn" : "text-t1",
              )}
            >
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </DataCard>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
      <label className={cn(Typography.Helper, "uppercase text-t3")}>{label}</label>
      <select
        className={cn(
          Typography.Helper,
          "border-0 bg-surface-low p-1.5 rounded-md text-t1 appearance-none cursor-pointer",
          "focus:outline-none focus:ring-1 focus:ring-t1/30",
        )}
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  )
}

function PerformancePageInner() {
  const router = useRouter()
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 7) + "-01")
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [engineer, setEngineer] = useState("all")
  const [clientId, setClientId] = useState("all")
  const [jobType, setJobType] = useState("all")
  const [tag, setTag] = useState("all")
  const [status, setStatus] = useState("all")
  const apiKey = buildApiKey("/api/performance", { from, to, engineer, clientId, jobType, tag, status })
  const { data, error, isLoading } = useApi<PerformancePayload>(apiKey)

  const created = findKpi(data?.kpis, "total-created")
  const completed = findKpi(data?.kpis, "total-completed")
  const turnaround = findKpi(data?.kpis, "avg-turnaround")
  const activeClients = findKpi(data?.kpis, "active-clients")

  const completionRate = useMemo(() => {
    const c = created?.value ?? 0
    const d = completed?.value ?? 0
    if (c <= 0) return null
    return Math.round((d / c) * 100)
  }, [created?.value, completed?.value])

  const engineerRows = useMemo(() => {
    const rows = (data?.engineerRows ?? [])
      .filter(r => r.jobsCompleted > 0 || r.jobsAssigned > 0)
      .slice(0, 12)
      .map(r => ({
        key: r.userId,
        name: r.name,
        completed: r.jobsCompleted,
        productivity:
          r.jobsAssigned > 0
            ? Math.min(1, r.jobsCompleted / r.jobsAssigned)
            : r.jobsCompleted > 0
              ? 1
              : 0,
      }))
    return rows.sort((a, b) => b.completed - a.completed)
  }, [data?.engineerRows])

  const statusPoints: ChartPoint[] = (data?.jobsByStatus ?? []).map(s => ({
    key: s.status,
    label: s.label,
    value: s.count,
  }))

  const syncTime = useMemo(
    () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh label when data identity changes
    [data],
  )

  async function exportFile(format: "csv" | "xlsx" | "pdf") {
    const url = buildApiKey("/api/performance/export", {
      format,
      from,
      to,
      engineer,
      clientId,
      jobType,
      tag,
      status,
    })
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
    <PageShell wide className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className={cn(Typography.PageTitle, "text-t1")}>Performance & Analytics</h1>
          <p className={cn(Typography.Small, "text-t3 mt-1")}>
            Operational intelligence across jobs, revisions, and engineer turnaround.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => exportFile("pdf")}>
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportFile("csv")}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportFile("xlsx")}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setLast30Days(setFrom, setTo)}
          >
            <Calendar className="h-3.5 w-3.5" /> Last 30 Days
          </Button>
        </div>
      </div>

      {/* Filters */}
      <DataCard className="p-4" hover={false}>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className={cn(Typography.Helper, "uppercase text-t3")}>Date Range</label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="h-8 border-0 bg-surface-low shadow-none"
              />
              <span className={cn(Typography.Helper, "text-t3")}>to</span>
              <Input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="h-8 border-0 bg-surface-low shadow-none"
              />
            </div>
          </div>
          <div className="hidden sm:block w-px h-10 bg-bd self-center mx-1" />
          <div className="flex-1 flex flex-wrap gap-4 min-w-0">
            <FilterSelect label="Engineer" value={engineer} onChange={setEngineer}>
              <option value="all">All Engineers</option>
              {data?.filterOptions.engineers.map(e => (
                <option key={e.id} value={e.name}>{e.name}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Client" value={clientId} onChange={setClientId}>
              <option value="all">All Clients</option>
              {data?.filterOptions.clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Status" value={status} onChange={setStatus}>
              <option value="all">All Status</option>
              {data?.filterOptions.statuses.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Job Type" value={jobType} onChange={setJobType}>
              <option value="all">All Job Types</option>
              {data?.filterOptions.jobTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </FilterSelect>
            <FilterSelect label="Tag" value={tag} onChange={setTag}>
              <option value="all">All Tags</option>
              {data?.filterOptions.tags.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </FilterSelect>
          </div>
        </div>
      </DataCard>

      {error && (
        <p className={cn(Typography.Small, "text-dn")}>
          {error instanceof Error ? error.message : "Failed to load analytics"}
        </p>
      )}
      {isLoading && !data && <ListSkeleton rows={4} className="space-y-2" />}

      {/* Hero KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <HeroKpi
          label="Total Jobs Created"
          value={created?.value ?? "—"}
          badge={<TrendBadge pct={created?.deltaPct ?? null} />}
          barPct={created ? Math.min(100, (created.value / Math.max(1, created.previousValue || created.value)) * 40) : 0}
        />
        <HeroKpi
          label="Jobs Completed"
          value={completed?.value ?? "—"}
          badge={
            completionRate != null ? (
              <span className={cn(Typography.Helper, "text-t3 bg-surface-low px-1 rounded")}>
                {completionRate}% rate
              </span>
            ) : (
              <TrendBadge pct={completed?.deltaPct ?? null} />
            )
          }
          barPct={completionRate ?? 0}
        />
        <HeroKpi
          label="Avg Turnaround"
          value={turnaround?.value ?? "—"}
          unit="Days"
          badge={<TrendBadge pct={turnaround?.deltaPct ?? null} />}
          barPct={
            turnaround
              ? Math.min(100, Math.max(12, 100 - turnaround.value * 8))
              : 0
          }
        />
        <HeroKpi
          label="Active Clients"
          value={activeClients?.value ?? "—"}
          badge={
            <span className={cn(Typography.Helper, "font-medium text-t1")}>
              {(activeClients?.value ?? 0) >= 10 ? "High Volume" : "Active"}
            </span>
          }
          barPct={Math.min(100, ((activeClients?.value ?? 0) / 20) * 100)}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8 space-y-8">
          <DataCard className="overflow-hidden">
            <div className="px-6 py-4 border-b border-bd bg-sr flex justify-between items-center">
              <h3 className={cn(Typography.Helper, "font-bold uppercase tracking-widest text-t1")}>
                Jobs by Status
              </h3>
              <Info className="h-4 w-4 text-t3" aria-hidden />
            </div>
            <div className="p-6 sm:p-8">
              <StatusBars points={statusPoints} />
            </div>
          </DataCard>

          <DataCard className="overflow-hidden">
            <div className="px-6 py-4 border-b border-bd bg-sr">
              <h3 className={cn(Typography.Helper, "font-bold uppercase tracking-widest text-t1")}>
                Engineer Performance (Completed)
              </h3>
            </div>
            <EngineerTable rows={engineerRows} />
          </DataCard>
        </div>

        <div className="xl:col-span-4 space-y-8">
          <MetricCard
            title="Workload Analytics"
            icon={<Activity className="h-4 w-4" aria-hidden />}
            items={[
              { label: "Current Workload", value: data?.workloadAnalytics.currentWorkload ?? 0 },
              { label: "Outstanding Jobs", value: data?.workloadAnalytics.outstandingJobs ?? 0 },
              {
                label: "Jobs Overdue",
                value: data?.workloadAnalytics.overdueJobs ?? 0,
                danger: (data?.workloadAnalytics.overdueJobs ?? 0) > 0,
              },
              { label: "Due Next Week", value: data?.workloadAnalytics.dueNextWeek ?? 0 },
            ]}
          />

          <MetricCard
            title="Time Analytics"
            icon={<Clock className="h-4 w-4" aria-hidden />}
            items={[
              {
                label: "Median Turnaround",
                value: `${data?.timeAnalytics.medianTurnaroundDays ?? 0} d`,
              },
              {
                label: "Fastest Completion",
                value: `${data?.timeAnalytics.fastestCompletionDays ?? 0} d`,
              },
              {
                label: "Longest Completion",
                value: `${data?.timeAnalytics.longestCompletionDays ?? 0} d`,
              },
              {
                label: "Avg Client Wait",
                value: `${data?.timeAnalytics.averageDaysWaitingForClientInformation ?? 0} d`,
              },
            ]}
          />

          <DataCard className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className={cn(Typography.Helper, "font-bold uppercase tracking-widest text-t1")}>
                Top Clients
              </h3>
              <button
                type="button"
                className={cn(Typography.Helper, "underline text-t2 hover:text-t1")}
                onClick={() => router.push("/clients")}
              >
                View All
              </button>
            </div>
            <div className="space-y-3">
              {(data?.topClients ?? []).slice(0, 6).map(client => (
                <button
                  key={client.clientId}
                  type="button"
                  onClick={() => router.push(`/clients/${client.clientId}`)}
                  className="w-full p-3 bg-surface-low rounded-md flex justify-between items-center text-left hover:bg-nav-hover transition-colors"
                >
                  <div className="min-w-0">
                    <p className={cn(Typography.Helper, "font-bold text-t1 truncate")}>
                      {client.clientName}
                    </p>
                    <p className={cn(Typography.Helper, "text-t3")}>
                      {client.totalJobs} Projects Total
                      {client.jobsInPeriod > 0 ? ` · ${client.jobsInPeriod} in period` : ""}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-t3 shrink-0" aria-hidden />
                </button>
              ))}
              {(data?.topClients?.length ?? 0) === 0 && (
                <p className={cn(Typography.Small, "text-t3")}>No clients in this period.</p>
              )}
            </div>
          </DataCard>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          Typography.Helper,
          "pt-8 border-t border-bd flex flex-col md:flex-row justify-between items-center gap-4 text-t3",
        )}
      >
        <div className="flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ok-ic" aria-hidden />
            <span className="uppercase tracking-wide">System Status: Operational</span>
          </div>
          <span className="uppercase tracking-wide">Last Sync: {syncTime}</span>
        </div>
        <div className="uppercase tracking-wide">
          © {new Date().getFullYear()} ORYX OS
        </div>
      </div>
    </PageShell>
  )
}

export default function PerformancePage() {
  return (
    <RequireRole roles={["ADMIN", "ACCOUNTS"]}>
      <PerformancePageInner />
    </RequireRole>
  )
}
