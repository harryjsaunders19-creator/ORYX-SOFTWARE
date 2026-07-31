"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ChevronDown, type LucideIcon } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { inspectorTokens, inspectorType } from "./tokens"

const iconClass = "h-4 w-4 shrink-0 text-t3"
const chevronSlot = "h-5 w-5 shrink-0"

export function InspectorSectionHeader({
  icon: Icon,
  children,
  trailing,
}: {
  icon: LucideIcon
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="flex min-h-11 w-full items-center justify-between gap-3 py-1">
      <h4 className={cn(inspectorType.sectionHeading, "mb-0 flex min-w-0 items-center gap-2")}>
        <Icon className={iconClass} aria-hidden />
        <span className="min-w-0 truncate">{children}</span>
      </h4>
      <div className="flex shrink-0 items-center justify-center">
        {trailing ?? <span className={chevronSlot} aria-hidden />}
      </div>
    </div>
  )
}

/** Static section block with shared header chrome and divider spacing. */
export function InspectorSection({
  icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("border-t border-inspector-divider", inspectorTokens.accordion, className)}>
      <InspectorSectionHeader icon={icon}>{title}</InspectorSectionHeader>
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

/** Collapsible inspector section — identical header styling to InspectorSection. */
export function AccordionSection({
  icon,
  title,
  children,
  defaultOpen = false,
  resetKey,
  className,
}: {
  icon: LucideIcon
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** When this changes, the accordion collapses (e.g. selected job id). */
  resetKey?: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(defaultOpen)

  useEffect(() => {
    setExpanded(defaultOpen)
  }, [resetKey, defaultOpen])

  return (
    <section className={cn("border-t border-inspector-divider", inspectorTokens.accordion, className)}>
      <button
        type="button"
        className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ac"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        <InspectorSectionHeader
          icon={icon}
          trailing={
            <ChevronDown
              className={cn(
                chevronSlot,
                "text-t2 transition-transform duration-200",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          }
        >
          {title}
        </InspectorSectionHeader>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-3.5">{children}</div>
        </div>
      </div>
    </section>
  )
}
