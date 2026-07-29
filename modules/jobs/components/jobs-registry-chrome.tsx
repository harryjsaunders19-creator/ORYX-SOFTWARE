"use client"

import Link from "next/link"
import {
  CheckCircle2, Circle, ClipboardCheck, Loader2, PenLine, Send,
} from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { getJobStatus } from "@/lib/constants"

/** Stitch Accordion List — Job Registry page title. */
export function JobsRegistryHeader({
  title = "Job Registry",
  description = "Monitor and manage all ongoing scaffold design projects.",
}: {
  title?: string
  description?: string
}) {
  return (
    <div className="mb-4">
      <h1 className={cn(Typography.PageTitle, "oryx-page-title text-t1")}>{title}</h1>
      <p className={cn(Typography.Small, "mt-1 text-t3")}>{description}</p>
    </div>
  )
}

/** Active ↔ Archive segmented control. */
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
        "inline-flex items-center gap-0.5 rounded border border-bd bg-surface-low p-0.5 shrink-0",
        className,
      )}
      role="group"
      aria-label="Job list scope"
    >
      <Link
        href="/jobs"
        className={cn(
          Typography.Badge,
          "px-3 py-1 rounded-sm transition-colors",
          active ? "bg-t1 text-sr font-semibold" : "text-t3 hover:bg-pg hover:text-t2",
        )}
        aria-current={active ? "page" : undefined}
      >
        Active
      </Link>
      <Link
        href="/archive"
        className={cn(
          Typography.Badge,
          "px-3 py-1 rounded-sm transition-colors",
          !active ? "bg-t1 text-sr font-semibold" : "text-t3 hover:bg-pg hover:text-t2",
        )}
      >
        Archived
      </Link>
    </div>
  )
}

/** Stitch REV pill — muted for A, filled for later revisions. */
export function RevisionPill({
  letter,
  emphasized = false,
}: {
  letter: string | null | undefined
  emphasized?: boolean
}) {
  if (!letter) return null
  return (
    <span
      className={cn(
        "inline-flex items-center shrink-0 rounded-sm px-1 py-0.5 font-bold uppercase tracking-wide",
        "text-[9px] leading-none",
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

export function DesignerAvatar({
  name,
  size = "sm",
}: {
  name: string | null | undefined
  size?: "sm" | "md"
}) {
  const initials = designerInitials(name)
  if (!initials) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-surface-low text-t4 font-bold shrink-0 border border-bd",
          size === "md" ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]",
        )}
        aria-hidden
      >
        ?
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-surface-low text-t2 font-bold shrink-0 border border-bd",
        size === "md" ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]",
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

/** Compact status line for accordion summary — Inter, uppercase, icon. */
export function AccordionStatus({
  status,
  isOnHold,
}: {
  status: string
  isOnHold?: boolean
}) {
  const s = getJobStatus(status)
  const Icon =
    status === "ISSUED" ? CheckCircle2
      : status === "CHECKING" ? ClipboardCheck
        : status === "READY_TO_SEND" ? Send
          : status === "IN_DESIGN" ? Loader2
            : status === "NEW_REQUEST" ? Circle
              : PenLine

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 flex-wrap">
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          status === "ISSUED" ? "text-ok-ic" : "text-t3",
          status === "IN_DESIGN" && "animate-pulse",
        )}
        aria-hidden
      />
      <span
        className={cn(
          Typography.Badge,
          "font-bold uppercase tracking-wide truncate",
          status === "ISSUED" ? "text-ok-tx" : "text-t2",
        )}
      >
        {s.label}
      </span>
      {isOnHold && (
        <span className="px-1 py-0.5 rounded-sm bg-dn-bg text-dn-tx border border-dn-bd text-[8px] font-bold uppercase tracking-wide">
          Hold
        </span>
      )}
    </span>
  )
}

/** Accordion column header row. */
export function AccordionListHeader() {
  return (
    <div
      className={cn(
        "hidden md:grid grid-cols-12 gap-2 px-4 py-2",
        Typography.Label,
        "text-t3 uppercase tracking-widest border-b border-bd/40",
      )}
    >
      <div className="col-span-2">Drawing No</div>
      <div className="col-span-1">Rev</div>
      <div className="col-span-4">Project / Client</div>
      <div className="col-span-2">Status</div>
      <div className="col-span-2">Designer</div>
      <div className="col-span-1" />
    </div>
  )
}
