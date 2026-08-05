"use client"

import Link from "next/link"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { TONE, type ToneKey } from "./dashboard-stats-primitives"

function KpiCard({
  label,
  value,
  sub,
  tone,
  href,
  emphasize,
}: {
  label: string
  value: number
  sub: string
  tone: ToneKey
  href: string
  emphasize?: boolean
}) {
  const t = TONE[tone]
  const subClass =
    emphasize && (tone === "due" || tone === "overdue")
      ? "text-dn-tx"
      : emphasize && tone === "checking"
        ? "text-wn-tx"
        : "text-t3"

  return (
    <Link
      href={href}
      className={cn(
        "cc-dashboard-kpi cc-dashboard-surface group relative flex min-h-[104px] flex-col px-4 py-4",
        "transition-colors duration-150 hover:border-bd hover:bg-hover-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20",
      )}
    >
      <span
        className="absolute inset-y-3 left-0 w-0.5 rounded-full"
        style={{ backgroundColor: t.accent, opacity: emphasize ? 1 : 0.4 }}
        aria-hidden
      />
      <p className={cn(Typography.Label, "min-h-4 font-medium text-t2")}>{label}</p>
      <div className="mt-3 flex flex-1 flex-col justify-end">
        <p className={cn(Typography.Stat, "cc-dashboard-stat tabular-nums text-t1")}>
          {value}
        </p>
        <p className={cn(Typography.Helper, "mt-1.5 font-medium", subClass)}>
          {sub}
        </p>
      </div>
    </Link>
  )
}

export function DashboardKpiGrid({
  active,
  dueWeek,
  checking,
  invoicing,
  overdueCount,
  activeRevisions,
  dueTodayCount,
  isAdmin,
}: {
  active: number
  dueWeek: number
  checking: number
  invoicing: number
  overdueCount: number
  activeRevisions?: number
  dueTodayCount?: number
  isAdmin: boolean
}) {
  return (
    <section
      aria-label="Dashboard summary"
      className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4"
    >
      <KpiCard
        label="Active Jobs"
        value={active}
        sub={activeRevisions ? `+${activeRevisions} active revisions` : "In flight"}
        tone="active"
        href="/jobs"
      />
      <KpiCard
        label="Due This Week"
        value={dueWeek}
        sub={dueWeek > 0 ? (dueTodayCount ? `${dueTodayCount} due today` : "Critical") : "Clear"}
        tone="due"
        href="/jobs?deadline=this_week"
        emphasize={dueWeek > 0}
      />
      <KpiCard
        label="Requires Check"
        value={checking}
        sub={checking > 0 ? "Pending" : "Queue clear"}
        tone="checking"
        href="/jobs/checking"
        emphasize={checking > 0}
      />
      {isAdmin ? (
        <KpiCard
          label="Ready to Invoice"
          value={invoicing}
          sub={invoicing > 0 ? "Awaiting handoff" : "Nothing queued"}
          tone="invoicing"
          href="/billing"
        />
      ) : (
        <KpiCard
          label="Overdue"
          value={overdueCount}
          sub={overdueCount > 0 ? "Needs attention" : "Clear"}
          tone="overdue"
          href="/jobs?deadline=overdue"
          emphasize={overdueCount > 0}
        />
      )}
    </section>
  )
}
