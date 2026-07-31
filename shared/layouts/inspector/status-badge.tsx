"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"

/**
 * Presentational status pill. Modules supply colour via `toneClass` /
 * `dotClass` (Jobs maps drawing status → these tokens).
 */
export function StatusBadge({
  children,
  toneClass,
  dotClass = "bg-t4",
  className,
}: {
  children: ReactNode
  /** Text + optional tint classes e.g. "text-ok-tx bg-ok-bg". */
  toneClass?: string
  dotClass?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-bd/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        toneClass,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden />
      {children}
    </span>
  )
}

export function StatusBadgeRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  )
}
