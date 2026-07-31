"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"

/**
 * Quiet revision pill — shared between register rows and the inspector
 * so REV labels stay visually consistent.
 */
export function RevisionBadge({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-bd/70 bg-surface-low",
        "px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-t2 tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  )
}
