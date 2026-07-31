"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"
import { InfoCard } from "./info-card"
import { inspectorType } from "./tokens"

/**
 * Primary engineer workspace card — answers “What does the engineer need to do?”
 */
export function RevisionCard({
  revisionLabel,
  instructionTitle = "Amendment Required",
  instructions,
  emptyInstructions,
  className,
}: {
  /** e.g. "REV A" or "Original" */
  revisionLabel: string
  instructionTitle?: string
  instructions?: string | null
  emptyInstructions?: string
  className?: string
}) {
  const body = instructions?.trim()
  return (
    <InfoCard title="Current Revision" className={cn("min-h-[7.5rem]", className)}>
      <p className="text-base font-bold tracking-tight text-t1">{revisionLabel}</p>
      <p className={cn(inspectorType.cardEyebrow, "mt-4 mb-2")}>{instructionTitle}</p>
      <p className={cn(body ? inspectorType.cardBody : inspectorType.cardBodyEmpty)}>
        {body || emptyInstructions || "No instructions have been entered."}
      </p>
    </InfoCard>
  )
}

export function RevisionCardShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <InfoCard title="Current Revision" className={className}>
      {children}
    </InfoCard>
  )
}
