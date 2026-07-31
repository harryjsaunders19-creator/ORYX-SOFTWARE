"use client"

import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/shared/utils/utils"

/**
 * Surface 2 — elevated inspector / focus panel.
 * Sits above the Surface 1 workspace (lists/tables) on Surface 0 page chrome.
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
      className={cn(
        "flex min-h-0 flex-col overflow-hidden p-4",
        "rounded-xl border border-bds/60 bg-s2 shadow-inspector",
        "motion-safe:transition-[box-shadow,border-color,opacity] motion-safe:duration-200 motion-safe:ease-out",
        className,
      )}
      aria-label="Job details"
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-s2",
          "ring-1 ring-inset ring-bd/50",
        )}
      >
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
    <div className="hidden md:flex shrink-0 items-stretch py-3 pr-2">
      <button
        type="button"
        onClick={onOpen}
        title="Show job details"
        aria-label="Show job details"
        className={cn(
          "flex w-7 flex-col items-center justify-center rounded-md border border-bd bg-s1 text-t3",
          "transition-colors hover:bg-s2 hover:text-t1",
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
        "rounded-md border border-bd p-1.5 text-t3 transition-colors",
        "hover:bg-surface-low hover:text-t1",
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
