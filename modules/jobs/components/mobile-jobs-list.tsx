"use client"

import { cn } from "@/shared/utils/utils"
import type { JobsRegisterProject } from "./jobs-register-types"
import { MobileJobCard } from "./mobile-job-card"

type Props = {
  projects: JobsRegisterProject[]
  selectedId: string | null
  workItemsModel: boolean
  designers: string[]
  loading?: boolean
  onSelect: (id: string) => void
  onStatusChanged?: () => void
  onDesignerChanged?: () => void
  className?: string
}

export function MobileJobsList({
  projects,
  selectedId,
  workItemsModel,
  designers,
  loading,
  onSelect,
  onStatusChanged,
  onDesignerChanged,
  className,
}: Props) {
  return (
    <div
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
        <div className="rounded-lg border border-bd bg-sr px-4 py-10 text-center">
          <p className="text-sm font-medium text-t1">No projects found</p>
          <p className="mt-1 text-sm text-t3">Try a different search or filter.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map(project => (
            <li key={project.id} className="min-w-0">
              <MobileJobCard
                project={project}
                selected={project.id === selectedId}
                workItemsModel={workItemsModel}
                designers={designers}
                onSelect={onSelect}
                onStatusChanged={onStatusChanged}
                onDesignerChanged={onDesignerChanged}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
