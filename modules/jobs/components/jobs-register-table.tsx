"use client"

import { useRef, useCallback, memo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/shared/utils/utils"
import { JobsRegisterRow, REGISTER_GRID } from "./jobs-register-row"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"

interface JobsRegisterTableProps {
  projects: JobsRegisterProject[]
  selectedId: string | null
  onSelect: (id: string) => void
  onOpenWorkspace: (id: string) => void
  workItemsModel: boolean
  designers: string[]
  onStatusChanged?: (projectId: string, nextStatus: string) => void
  onDesignerChanged?: (projectId: string, nextDesigner: string) => void
  loading?: boolean
  className?: string
}

const HEADERS = [
  "Drawing Number",
  "Client / Site",
  "Drawing Status",
  "Designer",
  "Value",
  "",
] as const

export const JobsRegisterTable = memo(function JobsRegisterTable({
  projects,
  selectedId,
  onSelect,
  onOpenWorkspace,
  workItemsModel,
  designers,
  onStatusChanged,
  onDesignerChanged,
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
  const onOpenStable = useCallback((id: string) => onOpenWorkspace(id), [onOpenWorkspace])

  return (
    <div className={cn("mx-5 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-bd bg-sr", className)}>
      <div role="row" className={cn(REGISTER_GRID, "sticky top-0 z-10 items-center border-b border-bd bg-sr")}>
        {HEADERS.map((label, i) => (
          <div
            key={label || `overflow-${i}`}
            role="columnheader"
            className={cn(
              "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-t3",
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
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-14 skeleton rounded-md" />
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
            style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
          >
            {virtualizer.getVirtualItems().map(item => {
              const project = projects[item.index]
              if (!project) return null
              return (
                <JobsRegisterRow
                  key={project.id}
                  project={project}
                  selected={project.id === selectedId}
                  workItemsModel={workItemsModel}
                  designers={designers}
                  onSelect={onSelectStable}
                  onOpenWorkspace={onOpenStable}
                  onStatusChanged={onStatusChanged}
                  onDesignerChanged={onDesignerChanged}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})
