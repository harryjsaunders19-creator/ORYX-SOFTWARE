"use client"

import { forwardRef, useCallback, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/shared/utils/utils"
import type { JobsRegisterProject } from "./jobs-register-types"
import { MobileJobCard } from "./mobile-job-card"

/** Card body ~150px + space-y-3 gap (12px) between items. */
const MOBILE_ROW_ESTIMATE = 162
const MOBILE_ROW_GAP = 12

type Props = {
  projects: JobsRegisterProject[]
  selectedId: string | null
  workItemsModel: boolean
  designers: string[]
  loading?: boolean
  highlightQuery?: string
  onSelect: (id: string) => void
  onStatusChanged?: (projectId: string, next: string) => void
  onOptimisticStatus?: (projectId: string, next: string) => void
  onStatusFailed?: (projectId: string, previous: string) => void
  onDesignerChanged?: (projectId: string, next: string) => void
  className?: string
}

export const MobileJobsList = forwardRef<HTMLDivElement, Props>(function MobileJobsList({
  projects,
  selectedId,
  workItemsModel,
  designers,
  loading,
  highlightQuery,
  onSelect,
  onStatusChanged,
  onOptimisticStatus,
  onStatusFailed,
  onDesignerChanged,
  className,
}, ref) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    parentRef.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref])

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => MOBILE_ROW_ESTIMATE,
    overscan: 6,
    gap: MOBILE_ROW_GAP,
  })

  return (
    <div
      ref={setScrollRef}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      aria-busy={loading || undefined}
    >
      {loading && projects.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-36 skeleton rounded-lg" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-bd bg-s1 px-4 py-10 text-center">
          <p className="text-sm font-medium text-t1">No projects found</p>
          <p className="mt-1 text-sm text-t3">Try a different search or filter.</p>
        </div>
      ) : (
        <ul
          className="relative m-0 list-none p-0"
          style={{ height: virtualizer.getTotalSize() }}
          aria-label="Job list"
        >
          {virtualizer.getVirtualItems().map(item => {
            const project = projects[item.index]
            if (!project) return null
            return (
              <li
                key={project.id}
                className="absolute left-0 top-0 min-w-0 w-full"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <MobileJobCard
                  project={project}
                  selected={project.id === selectedId}
                  workItemsModel={workItemsModel}
                  designers={designers}
                  highlightQuery={highlightQuery}
                  onSelect={onSelect}
                  onStatusChanged={onStatusChanged}
                  onOptimisticStatus={onOptimisticStatus}
                  onStatusFailed={onStatusFailed}
                  onDesignerChanged={onDesignerChanged}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
})
