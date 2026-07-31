"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"
import { inspectorTokens, inspectorType } from "./tokens"

export const infoCardClassName = cn(
  "rounded-[10px] border border-inspector-card-bd bg-inspector-card shadow-inspector-card",
)

/** Elevated information surface for high-priority inspector content. */
export function InfoCard({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn(infoCardClassName, inspectorTokens.cardPadding, className)}>
      {title ? <p className={cn(inspectorType.cardEyebrow, "mb-2")}>{title}</p> : null}
      {children}
    </div>
  )
}

/** @deprecated Use InfoCard */
export const InformationCard = InfoCard
export const informationCardClassName = infoCardClassName
