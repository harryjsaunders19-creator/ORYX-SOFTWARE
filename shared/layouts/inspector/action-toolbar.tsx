"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"

const btnBase =
  "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac"

export const inspectorActionPrimaryClass = cn(
  btnBase,
  "border border-transparent bg-ac text-on-ac hover:bg-ach",
)

export const inspectorActionSecondaryClass = cn(
  btnBase,
  "border border-bd bg-transparent text-t1 hover:bg-surface-low",
)

/** Equal-width action toolbar for inspector headers. */
export function ActionToolbar({
  children,
  className,
  columns = 3,
}: {
  children: ReactNode
  className?: string
  columns?: 2 | 3
}) {
  return (
    <div
      className={cn(
        "grid w-full gap-2.5",
        columns === 3 ? "grid-cols-3" : "grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  )
}
