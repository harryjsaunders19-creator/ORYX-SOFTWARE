"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"
import { InspectorShell, inspectorShellClassName } from "../inspector-shell"
import { inspectorTokens } from "./tokens"

export { InspectorShell, inspectorShellClassName }

/**
 * Inner inspector content column — standard body rhythm for all modules.
 */
export function InspectorPanel({
  children,
  className,
  label = "Details",
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <aside
      className={cn("flex h-full min-h-0 w-full flex-col bg-transparent", className)}
      aria-label={label}
    >
      {children}
    </aside>
  )
}

export function InspectorBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto",
        inspectorTokens.bodyPad,
        inspectorTokens.sectionY,
        className,
      )}
    >
      {children}
    </div>
  )
}
