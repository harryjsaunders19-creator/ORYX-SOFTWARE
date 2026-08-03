"use client"

import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/shared/utils/utils"

/**
 * Job Detail workspace — panel surface above the canvas, white cards inside.
 */
export function JobsInspectorShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label="Job details"
      className={cn(
        "jobs-detail-panel flex min-h-0 w-[480px] shrink-0 flex-col overflow-hidden",
        "rounded-[18px] border border-jobs-panel-bd bg-jobs-panel",
        "shadow-jobs-panel",
        "motion-safe:animate-[jobs-panel-in_180ms_ease-out]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-jobs-panel">
        {children}
      </div>
    </section>
  )
}

/** Narrow edge control to reopen a collapsed inspector. */
export function JobsInspectorReopenHandle({
  onOpen,
}: {
  onOpen: () => void
}) {
  return (
    <div className="hidden md:flex shrink-0 items-stretch py-5 pr-6">
      <button
        type="button"
        onClick={onOpen}
        title="Show job details"
        aria-label="Show job details"
        className={cn(
          "flex w-7 flex-col items-center justify-center rounded-[10px] border border-jobs-panel-bd bg-jobs-panel text-t3",
          "shadow-jobs-panel",
          "transition-colors duration-150 hover:bg-jobs-panel-hover hover:text-t1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac",
        )}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

export function JobsInspectorCollapseButton({
  onCollapse,
  variant = "chevron",
}: {
  onCollapse: () => void
  variant?: "chevron" | "close"
}) {
  return (
    <button
      type="button"
      onClick={onCollapse}
      aria-label="Collapse job details"
      title="Collapse job details"
      className={cn(
        "rounded-lg p-1.5 text-t3 transition-colors duration-150",
        "hover:bg-jobs-panel-hover hover:text-t1",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac",
      )}
    >
      {variant === "close" ? (
        <X className="h-4 w-4" aria-hidden />
      ) : (
        <ChevronRight className="h-4 w-4" aria-hidden />
      )}
    </button>
  )
}
