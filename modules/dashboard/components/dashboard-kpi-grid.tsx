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
    emphasize && tone === "due"
      ? "text-dn-tx"
      : emphasize && tone === "overdue"
        ? "text-dn-tx"
        : emphasize && tone === "checking"
          ? "text-wn-tx"
          : "text-t2"

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-bd bg-sr p-5 shadow-card",
        "transition-all duration-150 hover:border-bd-strong hover:bg-hover-surface",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20",
        "max-md:p-4",
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-0.5"
        style={{ backgroundColor: emphasize ? t.accent : "transparent" }}
        aria-hidden
      />
      <p className={cn(Typography.Label, "mb-3 font-medium text-t2")}>{label}</p>
      <div className="flex min-h-[2.25rem] items-baseline gap-2">
        <p className={cn(Typography.Stat, "cc-dashboard-stat tabular-nums text-t1")}>
          {value}
        </p>
        <span className={cn(Typography.Helper, "font-medium", subClass)}>
          {sub}
        </span>
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
      className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:mb-10 md:gap-5"
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
