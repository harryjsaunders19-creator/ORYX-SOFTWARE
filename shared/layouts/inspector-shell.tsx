"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"

/**
 * ORYX OS Inspector — Surface 2 outer chrome.
 *
 * Standard elevated focus panel for Jobs, Clients, Quotes, Calendar,
 * and every future module side panel. Apply only to the outer container;
 * leave internal cards/sections on their existing surfaces.
 */
export const inspectorShellClassName = cn(
  "flex min-h-0 flex-col overflow-hidden rounded-xl bg-s2 p-4",
  "border-2 border-inspector-bd shadow-inspector",
  "motion-safe:transition-[box-shadow,border-color,opacity] motion-safe:duration-200 motion-safe:ease-out",
)

export function InspectorShell({
  children,
  className,
  label = "Details",
}: {
  children: ReactNode
  className?: string
  /** Accessible name for the panel (e.g. "Job details"). */
  label?: string
}) {
  return (
    <section
      className={cn(inspectorShellClassName, className)}
      aria-label={label}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-s2">
        {children}
      </div>
    </section>
  )
}
