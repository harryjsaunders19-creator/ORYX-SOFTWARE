"use client"

import { useRef, useCallback, memo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { JobsRegisterRow } from "./jobs-register-row"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"

interface JobsRegisterTableProps {
  projects: JobsRegisterProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  className?: string
}

const HEADER =
  "grid grid-cols-[minmax(140px,1.1fr)_minmax(160px,1.4fr)_minmax(110px,0.9fr)_minmax(140px,1.1fr)_minmax(88px,0.7fr)] gap-3 px-4 h-9 items-center border-b border-bd bg-surface-low/60 sticky top-0 z-10"

export const JobsRegisterTable = memo(function JobsRegisterTable({
  projects,
  selectedId,
  onSelect,
  loading,
  className,
}: JobsRegisterTableProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => REGISTER_ROW_H,
    overscan: 12,
  })

  const onSelectStable = useCallback((id: string) => onSelect(id), [onSelect])

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-bd bg-sr", className)}>
      <div role="row" className={HEADER}>
        {["Drawing Number", "Client & Site", "Current Revision", "Next Action", "Value"].map(label => (
          <div
            key={label}
            role="columnheader"
            className={cn(
              Typography.Label,
              "uppercase tracking-wider text-t3",
              label === "Value" && "text-right",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <div
        ref={parentRef}
        role="rowgroup"
        className="min-h-0 flex-1 overflow-auto"
        aria-busy={loading || undefined}
      >
        {loading && projects.length === 0 ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 skeleton rounded-md" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-t3">
            No projects match these filters.
          </div>
        ) : (
          <div
            role="table"
            aria-label="Jobs register"
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map(item => {
              const project = projects[item.index]
              return (
                <div
                  key={project.id}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    height: item.size,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <JobsRegisterRow
                    project={project}
                    selected={selectedId === project.id}
                    onSelect={onSelectStable}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})
