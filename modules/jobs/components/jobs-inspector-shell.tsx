"use client"

import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { InspectorShell } from "@/shared/layouts/inspector-shell"
import { cn } from "@/shared/utils/utils"

/**
 * Jobs module wrapper around the shared Oryx InspectorShell (Surface 2).
 * Outer chrome only — internal inspector cards are unchanged.
 */
export function JobsInspectorShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <InspectorShell label="Job details" className={className}>
      {children}
    </InspectorShell>
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
