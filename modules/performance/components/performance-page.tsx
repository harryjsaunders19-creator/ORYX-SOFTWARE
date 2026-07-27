"use client"

import { useMemo, useState } from "react"
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  subMonths,
} from "date-fns"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { RequireRole } from "@/components/require-role"
import { PageHeader, PageShell, KpiTile, surfaceCard } from "@/shared/layouts/page-layout"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { cn } from "@/shared/utils"
import { buildApiKey, useApi } from "@/shared/hooks/use-api"
import type { PerformanceEmployeeRow, PerformancePayload } from "../types"

type SortKey =
  | "name"
  | "completedInPeriod"
  | "completedAllTime"
  | "avgPerWeek"
  | "inProgress"
  | "awaitingChecking"
  | "overdue"
  | "lastCompletedAt"

type PresetId = "this-week" | "this-month" | "last-month" | "this-year" | "custom"

function iso(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

function today(): Date {
  return new Date()
}

function rangeForPreset(id: Exclude<PresetId, "custom">): { from: string; to: string } {
  const now = today()
  switch (id) {
    case "this-week":
      return {
        from: iso(startOfWeek(now, { weekStartsOn: 1 })),
        to: iso(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case "this-month":
      return { from: iso(startOfMonth(now)), to: iso(now) }
    case "last-month": {
      const prev = subMonths(now, 1)
      return { from: iso(startOfMonth(prev)), to: iso(endOfMonth(prev)) }
    }
    case "this-year":
      return { from: iso(startOfYear(now)), to: iso(now) }
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("")
}

const PRESETS: { id: Exclude<PresetId, "custom">; label: string }[] = [
  { id: "this-week", label: "This week" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "this-year", label: "This year" },
]

function PerformancePageInner() {
  const defaultRange = rangeForPreset("this-month")
  const [preset, setPreset] = useState<PresetId>("this-month")
  const [from, setFrom] = useState(defaultRange.from)
  const [to, setTo] = useState(defaultRange.to)
  const [customFrom, setCustomFrom] = useState(defaultRange.from)
  const [customTo, setCustomTo] = useState(defaultRange.to)
  const [sortKey, setSortKey] = useState<SortKey>("completedInPeriod")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const apiKey = buildApiKey("/api/performance", { from, to })
  const { data, error, isLoading } = useApi<PerformancePayload>(apiKey)

  function applyPreset(id: Exclude<PresetId, "custom">) {
    const range = rangeForPreset(id)
    setPreset(id)
    setFrom(range.from)
    setTo(range.to)
    setCustomFrom(range.from)
    setCustomTo(range.to)
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    setPreset("custom")
    if (customTo < customFrom) {
      setFrom(customTo)
      setTo(customFrom)
    } else {
      setFrom(customFrom)
      setTo(customTo)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(key === "name" ? "asc" : "desc")
  }

  const employees = useMemo(() => {
    const rows = data?.employees ?? []
    const dir = sortDir === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return a.name.localeCompare(b.name)
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === "number" && typeof bv === "number") {
        return av === bv ? a.name.localeCompare(b.name) : (av - bv) * dir
      }
      return String(av).localeCompare(String(bv)) * dir || a.name.localeCompare(b.name)
    })
  }, [data?.employees, sortKey, sortDir])

  const overview = data?.overview

  const periodLabel = `${from} → ${to}`
  const teamMeta = isLoading
    ? "Loading…"
    : `${employees.length} users · ${overview?.adminUsers ?? 0} admin · ${overview?.engineerUsers ?? 0} engineer`

  return (
    <PageShell wide className="space-y-5 max-md:space-y-4">
      <PageHeader
        title="Employee Performance"
        description="Everyone from Users (Admins and Engineers) — measured by the designs they complete as job designers."
      />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {PRESETS.map(p => (
            <Button
              key={p.id}
              type="button"
              variant={preset === p.id ? "primary" : "outline"}
              size="sm"
              className="min-w-0 justify-center px-2 sm:px-3"
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-2">
            <div className="min-w-0 space-y-1.5 sm:space-y-1">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-t3">From</label>
              <Input
                type="date"
                className="w-full min-w-0 sm:w-[150px]"
                value={customFrom}
                onChange={e => {
                  setCustomFrom(e.target.value)
                  setPreset("custom")
                }}
              />
            </div>
            <div className="min-w-0 space-y-1.5 sm:space-y-1">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-t3">To</label>
              <Input
                type="date"
                className="w-full min-w-0 sm:w-[150px]"
                value={customTo}
                onChange={e => {
                  setCustomTo(e.target.value)
                  setPreset("custom")
                }}
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant={preset === "custom" ? "primary" : "outline"}
            className="w-full shrink-0 sm:w-auto"
            onClick={applyCustom}
          >
            Apply range
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-er">{error instanceof Error ? error.message : "Failed to load performance"}</p>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-3">
        <KpiTile
          className="max-md:p-4"
          label="Designs completed"
          value={overview?.completedInPeriod ?? (isLoading ? "…" : 0)}
          sub="In selected period"
          accent="var(--color-ok)"
        />
        <KpiTile
          className="max-md:p-4"
          label="In progress"
          value={overview?.inProgress ?? (isLoading ? "…" : 0)}
          sub="Live"
          accent="var(--color-ac)"
        />
        <KpiTile
          className="max-md:p-4"
          label="Avg completed / week"
          value={overview?.avgCompletedPerWeek ?? (isLoading ? "…" : 0)}
          sub="In selected period"
          accent="var(--color-ac)"
        />
        <KpiTile
          className="max-md:p-4"
          label="Active team"
          value={overview?.activeDesigners ?? (isLoading ? "…" : 0)}
          sub="With ≥1 in-progress job"
          accent="var(--color-ac)"
        />
        <KpiTile
          className="max-md:p-4"
          label="Awaiting checking"
          value={overview?.awaitingChecking ?? (isLoading ? "…" : 0)}
          sub="Live"
          accent="var(--color-wn)"
        />
        <KpiTile
          className="max-md:p-4"
          label="Overdue"
          value={overview?.overdue ?? (isLoading ? "…" : 0)}
          sub="Live"
          accent="var(--color-er)"
        />
      </div>

      <div className={cn(surfaceCard, "overflow-hidden")}>
        <div className="flex flex-col gap-1 border-b border-bd px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-t3">Team leaderboard</p>
          <p className="text-xs text-t4 break-words">
            <span className="tabular-nums">{periodLabel}</span>
            <span className="text-t4"> · {teamMeta}</span>
          </p>
        </div>

        {/* Mobile: stacked cards — avoids a squashed 880px table */}
        <div className="divide-y divide-bd md:hidden">
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <MobileSortChip label="Completed" active={sortKey === "completedInPeriod"} dir={sortDir} onClick={() => toggleSort("completedInPeriod")} />
            <MobileSortChip label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
            <MobileSortChip label="In progress" active={sortKey === "inProgress"} dir={sortDir} onClick={() => toggleSort("inProgress")} />
            <MobileSortChip label="Overdue" active={sortKey === "overdue"} dir={sortDir} onClick={() => toggleSort("overdue")} />
          </div>
          {!isLoading && employees.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-t3 italic">
              No users found. Add people in Users — they appear here automatically and match job designers by name.
            </p>
          )}
          {employees.map(row => (
            <EmployeeCard key={row.userId} row={row} />
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-bd bg-pg/40 text-[11px] font-mono uppercase tracking-wider text-t3">
                <SortTh label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                <SortTh label="Completed" active={sortKey === "completedInPeriod"} dir={sortDir} onClick={() => toggleSort("completedInPeriod")} align="right" />
                <SortTh label="All time" active={sortKey === "completedAllTime"} dir={sortDir} onClick={() => toggleSort("completedAllTime")} align="right" />
                <SortTh label="Avg / week" active={sortKey === "avgPerWeek"} dir={sortDir} onClick={() => toggleSort("avgPerWeek")} align="right" />
                <SortTh label="In progress" active={sortKey === "inProgress"} dir={sortDir} onClick={() => toggleSort("inProgress")} align="right" />
                <SortTh label="Checking" active={sortKey === "awaitingChecking"} dir={sortDir} onClick={() => toggleSort("awaitingChecking")} align="right" />
                <SortTh label="Overdue" active={sortKey === "overdue"} dir={sortDir} onClick={() => toggleSort("overdue")} align="right" />
                <SortTh label="Last completed" active={sortKey === "lastCompletedAt"} dir={sortDir} onClick={() => toggleSort("lastCompletedAt")} />
              </tr>
            </thead>
            <tbody>
              {!isLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-t3 italic">
                    No users found. Add people in Users — they appear here automatically and match job designers by name.
                  </td>
                </tr>
              )}
              {employees.map(row => (
                <EmployeeRow key={row.userId} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-t4 max-md:leading-relaxed">
        Admins and Engineers from Users are listed. Jobs count when the designer matches a person by full name, unique first name, or email prefix (e.g. Harry → Harry Saunders / harry@…). Unmatched designer names from jobs still appear.
      </p>
    </PageShell>
  )
}

function MobileSortChip({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: "asc" | "desc"
  onClick: () => void
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-[11px] font-medium",
        active
          ? "border-t1 bg-t1 text-pg"
          : "border-bd bg-sr text-t3",
      )}
    >
      {label}
      <Icon className="h-3 w-3 opacity-70" />
    </button>
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
    <th className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-t1",
          align === "right" && "flex-row-reverse",
          active ? "text-t1" : "text-t3",
        )}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  )
}

function roleLabelFor(row: PerformanceEmployeeRow): string {
  if (!row.fromDirectory) return "On jobs"
  return row.role === "ADMIN" ? "Admin" : "Engineer"
}

function EmployeeCard({ row }: { row: PerformanceEmployeeRow }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pg text-[11px] font-semibold text-t2">
          {initials(row.name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-t1">{row.name}</p>
              <p className="text-[11px] text-t3">{roleLabelFor(row)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold tabular-nums leading-none text-t1">{row.completedInPeriod}</p>
              <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-t4">Done</p>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-t4">All time</dt>
              <dd className="tabular-nums text-t2">{row.completedAllTime}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-t4">Avg / wk</dt>
              <dd className="tabular-nums text-t2">{row.avgPerWeek}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-t4">In progress</dt>
              <dd className="tabular-nums text-t2">{row.inProgress}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-t4">Checking</dt>
              <dd className="tabular-nums text-t2">{row.awaitingChecking}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-t4">Overdue</dt>
              <dd className={cn("tabular-nums", row.overdue > 0 ? "font-semibold text-er" : "text-t2")}>
                {row.overdue}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-t4">Last done</dt>
              <dd className="tabular-nums text-t2">{row.lastCompletedAt ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

function EmployeeRow({ row }: { row: PerformanceEmployeeRow }) {
  return (
    <tr className="border-b border-bd/70 last:border-0 hover:bg-pg/30">
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pg text-[11px] font-semibold text-t2">
            {initials(row.name) || "?"}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-t1">{row.name}</span>
            <p className="text-[11px] text-t3">{roleLabelFor(row)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-t1">{row.completedInPeriod}</td>
      <td className="px-3 py-3 text-right tabular-nums text-t2">{row.completedAllTime}</td>
      <td className="px-3 py-3 text-right tabular-nums text-t2">{row.avgPerWeek}</td>
      <td className="px-3 py-3 text-right tabular-nums text-t2">{row.inProgress}</td>
      <td className="px-3 py-3 text-right tabular-nums text-t2">{row.awaitingChecking}</td>
      <td className={cn("px-3 py-3 text-right tabular-nums", row.overdue > 0 ? "font-semibold text-er" : "text-t2")}>
        {row.overdue}
      </td>
      <td className="px-3 py-3 text-t3 tabular-nums">{row.lastCompletedAt ?? "—"}</td>
    </tr>
  )
}

export default function PerformancePage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <PerformancePageInner />
    </RequireRole>
  )
}
