"use client"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"

/** Stitch Job Registry page title + active-count badge. */
export function JobsRegistryHeader({
  title = "Job Registry",
  description = "Monitor and manage all ongoing scaffold design projects.",
  activeCount,
  countLabel = "active jobs",
  actions,
}: {
  title?: string
  description?: string
  activeCount?: number | null
  countLabel?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
      <div className="min-w-0">
        <h1 className={cn(Typography.PageTitle, "oryx-page-title text-t1")}>{title}</h1>
        <p className={cn(Typography.Small, "mt-2 text-t3")}>{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {activeCount != null && (
          <span
            className={cn(
              Typography.Badge,
              "px-3 py-1.5 rounded-lg border border-bd bg-surface-low text-t2 tabular-nums",
            )}
          >
            {activeCount.toLocaleString()} {countLabel}
          </span>
        )}
        {actions}
      </div>
    </div>
  )
}

/** Active ↔ Archive scope toggle — Archive opens the real archive module. */
export function JobsScopeToggle({
  active = true,
  className,
}: {
  active?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-bd p-0.5 bg-sr shrink-0",
        className,
      )}
      role="group"
      aria-label="Job list scope"
    >
      <Link
        href="/jobs"
        className={cn(
          Typography.Badge,
          "px-3 py-1.5 rounded-sm transition-colors",
          active ? "bg-t1 text-sr font-semibold" : "text-t3 hover:text-t2",
        )}
        aria-current={active ? "page" : undefined}
      >
        Active
      </Link>
      <Link
        href="/archive"
        className={cn(
          Typography.Badge,
          "px-3 py-1.5 rounded-sm transition-colors",
          !active ? "bg-t1 text-sr font-semibold" : "text-t3 hover:text-t2",
        )}
      >
        Archived
      </Link>
    </div>
  )
}

/** Stitch REV pill beside drawing numbers. */
export function RevisionPill({
  letter,
  emphasized = false,
}: {
  letter: string | null | undefined
  /** Black fill for current / non-A revisions (Stitch treatment). */
  emphasized?: boolean
}) {
  if (!letter) return null
  return (
    <span
      className={cn(
        "inline-flex items-center shrink-0 rounded-sm px-1.5 py-0.5 font-bold uppercase tracking-wide",
        "text-[10px] leading-none",
        emphasized
          ? "bg-t1 text-sr"
          : "bg-surface-low text-t2 border border-bd",
      )}
      title={`Revision ${letter}`}
    >
      Rev {letter}
    </span>
  )
}

/** Designer initials avatar — Stitch registry column. */
export function DesignerAvatar({
  name,
  size = "sm",
}: {
  name: string | null | undefined
  size?: "sm" | "md"
}) {
  const initials = designerInitials(name)
  if (!initials) return null
  const dim = size === "md" ? "h-7 w-7 text-[11px]" : "h-6 w-6 text-[10px]"
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-surface-low text-t2 font-bold shrink-0 border border-bd",
        dim,
      )}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function designerInitials(name: string | null | undefined): string | null {
  if (!name?.trim()) return null
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase()
}

/** Footer insight tiles — only real metrics (no invented averages / forecasts). */
export function JobsRegistryInsights({
  onHoldCount,
  matchingCount,
}: {
  onHoldCount: number
  matchingCount?: number | null
}) {
  const tiles = [
    matchingCount != null && (
      <InsightTile
        key="matching"
        label="Matching jobs"
        value={matchingCount.toLocaleString()}
      />
    ),
    <InsightTile
      key="hold"
      label="On hold clients"
      value={`${onHoldCount.toLocaleString()} flagged`}
      icon={<AlertTriangle className="h-5 w-5 text-t2" aria-hidden />}
      href="/clients/hold-list"
    />,
  ].filter(Boolean)

  return (
    <div className={cn(
      "mt-6 grid gap-4",
      tiles.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-md",
    )}>
      {tiles}
    </div>
  )
}

function InsightTile({
  label,
  value,
  icon,
  href,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  href?: string
}) {
  const inner = (
    <>
      <div className="h-12 w-12 rounded-lg bg-surface-low border border-bd flex items-center justify-center shrink-0">
        {icon ?? <span className={cn(Typography.Badge, "text-t2 font-bold")}>#</span>}
      </div>
      <div className="min-w-0">
        <p className={cn(Typography.Label, "text-t3 uppercase tracking-wide")}>{label}</p>
        <p className={cn(Typography.SectionHeading, "text-t1 mt-0.5 tabular-nums")}>{value}</p>
      </div>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="oryx-surface-card bg-sr border border-bd rounded-xl px-5 py-4 flex items-center gap-4 hover:border-bds transition-colors"
      >
        {inner}
      </Link>
    )
  }

  return (
    <div className="oryx-surface-card bg-sr border border-bd rounded-xl px-5 py-4 flex items-center gap-4">
      {inner}
    </div>
  )
}
