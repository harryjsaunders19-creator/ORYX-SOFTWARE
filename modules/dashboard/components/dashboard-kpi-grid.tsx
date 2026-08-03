"use client"

import Link from "next/link"
import { cn } from "@/shared/utils/utils"

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatMoneyShort(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m total`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k total`
  return `$${Math.round(value)} total`
}

function KpiCard({
  label,
  value,
  displayValue,
  sub,
  subTone = "muted",
  href,
}: {
  label: string
  value: number
  displayValue?: string
  sub: string
  subTone?: "muted" | "critical" | "primary" | "secondary"
  href: string
}) {
  const subClass =
    subTone === "critical"
      ? "text-[#ba1a1a]"
      : subTone === "primary"
        ? "text-black"
        : subTone === "secondary"
          ? "text-[#5e5e5e]"
          : "text-[#4c4546]"

  return (
    <Link
      href={href}
      className="block rounded-xl border border-bd bg-sr p-6 shadow-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15 max-md:p-4"
    >
      <p className="mb-2 text-sm font-medium text-[#4c4546] dark:text-t3">{label}</p>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[32px] font-bold leading-[1.2] tracking-[-0.02em] text-t1 tabular-nums">
          {displayValue ?? value}
        </h2>
        <span className={cn("text-[12px] font-bold", subClass)}>{sub}</span>
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
  totalRevisions,
  dueTodayCount,
  invoicingValue,
  isAdmin,
}: {
  active: number
  dueWeek: number
  checking: number
  invoicing: number
  overdueCount: number
  totalRevisions?: number
  dueTodayCount?: number
  invoicingValue?: number | null
  isAdmin: boolean
}) {
  const invoiceSub = formatMoneyShort(invoicingValue) ?? (invoicing > 0 ? "Awaiting handoff" : "Nothing queued")

  return (
    <section className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 md:mb-12">
      <KpiCard
        label="Active Jobs"
        value={active}
        sub={totalRevisions ? `+${totalRevisions} revisions` : "In flight"}
        subTone="primary"
        href="/jobs"
      />
      <KpiCard
        label="Due This Week"
        value={dueWeek}
        displayValue={pad2(dueWeek)}
        sub={dueWeek > 0 ? (dueTodayCount ? `${dueTodayCount} due today` : "Critical") : "Clear"}
        subTone={dueWeek > 0 ? "critical" : "muted"}
        href="/jobs?deadline=this_week"
      />
      <KpiCard
        label="Requires Check"
        value={checking}
        sub={checking > 0 ? "Engineering Review" : "Queue clear"}
        subTone={checking > 0 ? "secondary" : "muted"}
        href="/jobs/checking"
      />
      {isAdmin ? (
        <KpiCard
          label="Ready to Invoice"
          value={invoicing}
          sub={invoiceSub}
          subTone="muted"
          href="/billing"
        />
      ) : (
        <KpiCard
          label="Overdue"
          value={overdueCount}
          displayValue={pad2(overdueCount)}
          sub={overdueCount > 0 ? "Needs attention" : "Clear"}
          subTone={overdueCount > 0 ? "critical" : "muted"}
          href="/jobs?deadline=overdue"
        />
      )}
    </section>
  )
}
