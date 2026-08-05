"use client"

import { useRef, useCallback, memo } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderSearch } from "lucide-react"
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
  highlightQuery?: string
  onStatusChanged?: (projectId: string, nextStatus: string) => void
  onOptimisticStatus?: (projectId: string, nextStatus: string) => void
  onStatusFailed?: (projectId: string, previous: string) => void
  onDesignerChanged?: (projectId: string, nextDesigner: string) => void
  onPrefetch?: (id: string) => void
  loading?: boolean
  className?: string
}

const HEADERS = [
  "Job ID / Drawing",
  "Client",
  "Site Location",
  "Status",
  "Designer",
  "",
] as const

export const JobsRegisterTable = memo(function JobsRegisterTable({
  projects,
  selectedId,
  onSelect,
  onOpenWorkspace,
  workItemsModel,
  designers,
  highlightQuery,
  onStatusChanged,
  onOptimisticStatus,
  onStatusFailed,
  onDesignerChanged,
  onPrefetch,
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
    <div
      className={cn(
        "mx-8 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-jobs-panel-bd bg-s1 shadow-jobs-list",
        className,
      )}
    >
      <div
        role="row"
        className={cn(
          REGISTER_GRID,
          "sticky top-0 z-20 shrink-0 items-center border-b border-jobs-table-header-bd bg-jobs-table-header",
        )}
      >
        {HEADERS.map((label, i) => (
          <div
            key={label || `overflow-${i}`}
            role="columnheader"
            className={cn(
              "px-6 py-4 text-[11px] font-semibold uppercase tracking-wider text-t3",
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
              <div key={i} className="h-12 skeleton rounded-md" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2.5 px-6 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-bd bg-s0">
              <FolderSearch className="h-5 w-5 text-t3" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-t1">No projects match these filters</p>
            <p className="max-w-xs text-xs leading-relaxed text-t2">
              Try clearing search, resetting client/site filters, or switching the scope tabs above.
            </p>
          </div>
        ) : (
          <div
            role="table"
            aria-label="Job list"
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
                  rowIndex={item.index}
                  workItemsModel={workItemsModel}
                  designers={designers}
                  highlightQuery={highlightQuery}
                  onSelect={onSelectStable}
                  onOpenWorkspace={onOpenStable}
                  onStatusChanged={onStatusChanged}
                  onOptimisticStatus={onOptimisticStatus}
                  onStatusFailed={onStatusFailed}
                  onDesignerChanged={onDesignerChanged}
                  onPrefetch={onPrefetch}
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
