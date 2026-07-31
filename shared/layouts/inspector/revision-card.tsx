"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"
import { InfoCard } from "./info-card"
import { inspectorType } from "./tokens"

/**
 * Primary engineer workspace card — answers “What does the engineer need to do?”
 * Kept dense: amendment body is the visual focus.
 */
export function RevisionCard({
  revisionLabel,
  amendmentNumber,
  instructionTitle = "Amendment Required",
  instructions,
  emptyInstructions,
  className,
}: {
  /** e.g. "REV A" or "Original" */
  revisionLabel: string
  /** Optional amendment / sequence number shown beside the revision. */
  amendmentNumber?: string | number | null
  instructionTitle?: string
  instructions?: string | null
  emptyInstructions?: string
  className?: string
}) {
  const body = instructions?.trim()
  const amendment =
    amendmentNumber != null && String(amendmentNumber).trim()
      ? String(amendmentNumber).trim()
      : null

  return (
    <InfoCard
      title="Current Revision"
      titleClassName="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-t1"
      className={cn("!px-3.5 !py-3 min-h-0", className)}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-base font-bold tracking-tight text-t1 tabular-nums">
          {revisionLabel}
        </p>
        {amendment ? (
          <span className="inline-flex items-center rounded-md border border-bd/70 bg-s0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-t2 tabular-nums">
            Amd {amendment}
          </span>
        ) : null}
      </div>
      <p className={cn(inspectorType.cardEyebrow, "mt-2.5 mb-1 text-[10px]")}>{instructionTitle}</p>
      <p
        className={cn(
          body
            ? "text-[15px] font-semibold leading-snug whitespace-pre-wrap text-t1"
            : "text-sm font-medium leading-snug text-t2",
        )}
      >
        {body || emptyInstructions || "No instructions have been entered."}
      </p>
    </InfoCard>
  )
}

export function RevisionCardShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <InfoCard
      title="Current Revision"
      titleClassName="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-t1"
      className={cn("!px-3.5 !py-3", className)}
    >
      {children}
    </InfoCard>
  )
}
