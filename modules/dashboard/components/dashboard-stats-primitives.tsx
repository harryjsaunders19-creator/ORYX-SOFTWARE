"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"

/** KPI / legend colours — aligned with job-list status tokens. */
export const TONE = {
  active: {
    accent: "var(--color-ac)",
    icon: "text-t2 bg-nested-surface",
    badge: "bg-nested-surface text-t2",
    dot: "bg-t1",
  },
  due: {
    accent: "var(--color-dn)",
    icon: "text-dn bg-dn-bg",
    badge: "bg-dn-bg text-dn-tx",
    dot: "bg-dn",
  },
  checking: {
    accent: "var(--color-wn)",
    icon: "text-wn bg-wn-bg",
    badge: "bg-wn-bg text-wn-tx",
    dot: "bg-wn",
  },
  invoicing: {
    accent: "var(--color-ok-ic)",
    icon: "text-ok-ic bg-ok-bg",
    badge: "bg-ok-bg text-ok-tx",
    dot: "bg-ok-ic",
  },
  overdue: {
    accent: "var(--color-dn)",
    icon: "text-dn bg-dn-bg",
    badge: "bg-dn-bg text-dn-tx",
    dot: "bg-dn",
  },
  hold: {
    accent: "var(--color-wn)",
    icon: "text-wn-ic bg-wn-bg",
    badge: "bg-wn-bg text-wn-tx",
    dot: "bg-wn-ic",
  },
} as const

export type ToneKey = keyof typeof TONE

/** Shared section heading used across dashboard panels. */
export function DashboardSectionHeader({
  title,
  count,
  countTone,
  icon: Icon,
  viewAllHref,
  viewAllLabel,
  as = "h2",
  id,
}: {
  title: string
  count?: number
  countTone?: ToneKey
  icon?: React.ElementType
  viewAllHref?: string
  viewAllLabel?: string
  as?: "h2" | "h3"
  id?: string
}) {
  const Heading = as
  const badgeClass = countTone ? TONE[countTone].badge : "bg-nested-surface text-t2"
  return (
    <div className="mb-4 flex items-center justify-between gap-3 md:mb-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-t2" aria-hidden />}
        <Heading id={id} className={cn(Typography.SectionHeading, "text-t1")}>{title}</Heading>
        {count != null && count > 0 && (
          <span
            className={cn(
              Typography.Badge,
              "inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1.5 tabular-nums",
              badgeClass,
            )}
          >
            {count}
          </span>
        )}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className={cn(
            Typography.Helper,
            "inline-flex shrink-0 items-center gap-0.5 font-medium text-t2 transition-colors hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20 rounded-sm",
          )}
        >
          {viewAllLabel ?? "View all"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}

/** Compact empty state — no illustrations. */
export function DashboardEmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-bd bg-sr px-5 py-8 shadow-card">
      <p className={cn(Typography.Small, "text-center text-t2")}>{message}</p>
    </div>
  )
}

export function StatCard({
  icon: Icon,
  label,
  value,
  href,
  sub,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  href?: string
  sub?: string
  tone: ToneKey
}) {
  const t = TONE[tone]
  const inner = (
    <div className="group relative h-full overflow-hidden rounded-xl border border-bd bg-sr p-5 shadow-card transition-all duration-150 hover:border-bd-strong hover:shadow-sm max-md:p-4">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: t.accent }} />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={cn("rounded-full p-2.5", t.icon)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <span className={cn(
          "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 type-badge tabular-nums",
          t.badge,
        )}>
          {value}
        </span>
      </div>
      <p className={cn(Typography.Stat, "text-t1")}>
        {value}
      </p>
      <p className={cn(Typography.Small, "mt-2 font-medium text-t1")}>{label}</p>
      {sub && <p className={cn(Typography.Helper, "mt-1 text-t2")}>{sub}</p>}
    </div>
  )
  return href ? (
    <Link
      href={href}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20"
    >
      {inner}
    </Link>
  ) : inner
}

export function Panel({
  title,
  count,
  countTone,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string
  count?: number
  countTone?: ToneKey
  viewAllHref?: string
  viewAllLabel?: string
  children: React.ReactNode
}) {
  const badgeClass = countTone ? TONE[countTone].badge : "bg-nested-surface text-t2"
  return (
    <section className="flex min-h-56 flex-col overflow-hidden rounded-xl border border-bd bg-sr shadow-card">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={cn(Typography.CardTitle, "text-t1")}>{title}</h2>
          {count != null && count > 0 && (
            <span className={cn(
              Typography.Badge,
              "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 tabular-nums",
              badgeClass,
            )}>
              {count}
            </span>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className={cn(Typography.Helper, "inline-flex shrink-0 items-center gap-0.5 font-medium text-t2 transition-colors hover:text-t1")}
          >
            {viewAllLabel ?? "View all"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="flex flex-1 flex-col border-t border-bd">{children}</div>
    </section>
  )
}

export function PanelEmpty({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10">
      <Icon className="h-5 w-5 text-t3" aria-hidden />
      <p className={cn(Typography.Small, "text-center text-t2")}>{message}</p>
    </div>
  )
}

export function LegendDot({ tone, label, value }: { tone: ToneKey; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-t2">
      <span className={cn("h-2 w-2 rounded-full", TONE[tone].dot)} aria-hidden />
      <span className="text-t2">{label}</span>
      <span className="font-semibold tabular-nums text-t1">{value}</span>
    </span>
  )
}
