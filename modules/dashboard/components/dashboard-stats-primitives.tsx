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
  size = "default",
}: {
  title: string
  count?: number
  countTone?: ToneKey
  icon?: React.ElementType
  viewAllHref?: string
  viewAllLabel?: string
  as?: "h2" | "h3"
  id?: string
  size?: "default" | "compact"
}) {
  const Heading = as
  const badgeClass = countTone ? TONE[countTone].badge : "bg-nested-surface text-t2"
  const titleClass =
    size === "compact"
      ? cn(Typography.Label, "font-semibold uppercase tracking-[0.14em] text-t2")
      : cn(Typography.SectionHeading, "text-t1")

  return (
    <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-t2" aria-hidden />}
        <Heading id={id} className={titleClass}>{title}</Heading>
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

/** Compact empty state — no illustrations or heavy borders. */
export function DashboardEmptyState({
  message,
  detail,
}: {
  message: string
  detail?: string
}) {
  return (
    <div className="cc-dashboard-empty">
      <p>{message}</p>
      {detail && (
        <p className="mt-0.5 text-t3">{detail}</p>
      )}
    </div>
  )
}
