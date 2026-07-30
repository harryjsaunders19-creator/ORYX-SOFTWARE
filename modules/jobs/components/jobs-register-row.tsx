"use client"

import { memo } from "react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { siteDisplay } from "./jobs-register-helpers"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"

interface JobsRegisterRowProps {
  project: JobsRegisterProject
  selected: boolean
  workItemsModel: boolean
  style?: React.CSSProperties
  onSelect: (id: string) => void
  onStatusChanged?: (projectId: string, nextStatus: string) => void
}

export const JobsRegisterRow = memo(function JobsRegisterRow({
  project,
  selected,
  workItemsModel,
  style,
  onSelect,
  onStatusChanged,
}: JobsRegisterRowProps) {
  const site = siteDisplay(project.siteName, project.address)
  const canChangeStatus = project.currentWorkType !== "none" && Boolean(project.detailId)
  const patchUrl = workItemsModel && project.kind === "work_item"
    ? `/api/work-items/${project.detailId}`
    : undefined

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={-1}
      data-selected={selected ? "true" : undefined}
      style={{ ...style, height: REGISTER_ROW_H }}
      onClick={() => onSelect(project.id)}
      onKeyDown={e => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          onSelect(project.id)
        }
      }}
      className={cn(
        "group grid grid-cols-[1.2fr_1.4fr_0.9fr_0.7fr] items-center gap-0 border-b border-bd/40 px-0 cursor-pointer transition-colors duration-150",
        "outline-none",
        selected
          ? "bg-ac/5 border-l-4 border-l-ac"
          : "border-l-4 border-l-transparent hover:bg-[#f3f3f3]",
      )}
    >
      <div role="cell" className="min-w-0 px-4 py-3">
        <p className="text-sm font-bold text-t1 truncate">
          {project.drawingNumber}
        </p>
        <p className="text-[10px] uppercase font-bold text-t4 mt-0.5 truncate">
          {project.currentWorkType === "revision" && project.currentRevisionLetter
            ? `Rev ${project.currentRevisionLetter}`
            : project.currentWorkType === "original"
              ? "Original"
              : "Closed"}
        </p>
      </div>

      <div role="cell" className="min-w-0 px-4 py-3">
        <p className="text-sm font-medium text-t1 truncate">{project.clientCompany || "—"}</p>
        <p className="text-xs text-t3 mt-0.5 truncate">{site}</p>
      </div>

      <div
        role="cell"
        className="px-4 py-3 min-w-0"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-t4 truncate">
          {project.currentWorkLabel}
        </p>
        <div className="mt-0.5">
          {canChangeStatus ? (
            <WorkItemStatusSelector
              workItemType={project.currentWorkType === "revision" ? "revision" : "original"}
              workItemId={project.detailId}
              currentStatus={project.currentStatus}
              revisionLabel={
                project.currentWorkType === "revision"
                  ? project.currentWorkLabel
                  : null
              }
              patchUrl={patchUrl}
              size="md"
              onStatusChanged={next => onStatusChanged?.(project.id, next)}
            />
          ) : (
            <p className="text-xs text-t3">{project.currentWorkDetail}</p>
          )}
        </div>
      </div>

      <div role="cell" className="px-4 py-3 text-right text-sm font-medium tabular-nums text-t1">
        {formatGBP(project.value)}
      </div>
    </div>
  )
})
