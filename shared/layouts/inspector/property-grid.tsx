"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"
import { inspectorTokens, inspectorType } from "./tokens"

export function PropertyCell({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-[3.5rem] flex-col gap-1.5", className)}>
      <p className={inspectorType.fieldLabel}>{label}</p>
      <div className="flex min-h-7 items-center">{children}</div>
    </div>
  )
}

/** Two-column engineering property panel. */
export function PropertyGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2",
        inspectorTokens.metaCol,
        inspectorTokens.metaRow,
        className,
      )}
    >
      {children}
    </div>
  )
}
