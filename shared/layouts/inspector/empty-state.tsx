"use client"

import type { ReactNode } from "react"
import { cn } from "@/shared/utils/utils"
import { InfoCard } from "./info-card"
import { inspectorType } from "./tokens"

/** Calm empty state for inspectors — prefer inside an InfoCard / RevisionCard. */
export function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn(className)}>
      <p className={inspectorType.cardTitle}>{title}</p>
      {description ? (
        <div className="mt-3 space-y-1 text-sm text-t3">{description}</div>
      ) : null}
      {children ? <div className="mt-3 text-sm text-t3">{children}</div> : null}
    </div>
  )
}

export function EmptyStateCard({
  eyebrow = "Current Revision",
  title,
  description,
  children,
  className,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <InfoCard
      title={eyebrow}
      titleClassName={
        eyebrow === "Current Revision"
          ? "text-[11px] font-bold uppercase tracking-[0.16em] text-t1"
          : undefined
      }
      className={className}
    >
      <EmptyState title={title} description={description}>
        {children}
      </EmptyState>
    </InfoCard>
  )
}
