"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"

/**
 * Standard Oryx OS information card — elevated white (light) / preserved
 * dark surface for high-priority content inside inspectors and detail panels.
 *
 * Use for: Amendment Required, Current Drawing, CATII / Quote summaries,
 * engineering alerts. Do not use for every metadata field.
 */
export const informationCardClassName = cn(
  "rounded-[10px] border border-inspector-card-bd bg-inspector-card shadow-inspector-card",
)

export function InformationCard({
  title,
  children,
  className,
}: {
  /** Optional uppercase section label above the body. */
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn(informationCardClassName, className)}>
      {title ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-t3">
          {title}
        </p>
      ) : null}
      {children}
    </div>
  )
}
