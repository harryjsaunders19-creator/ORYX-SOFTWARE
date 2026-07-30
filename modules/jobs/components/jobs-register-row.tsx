"use client"

import { memo } from "react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { drawingNumberContext, siteDisplay } from "./jobs-register-helpers"
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
  const contextLine = drawingNumberContext(project)

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
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
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac2",
        selected
          ? "bg-ac2-bg/70 border-l-[3px] border-l-ac2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ac2)_22%,transparent)]"
          : "border-l-[3px] border-l-transparent hover:bg-surface-low",
      )}
    >
      <div role="cell" className="min-w-0 px-4 py-3">
        <p
          className={cn(
            "text-sm truncate",
            selected ? "font-bold text-t1" : "font-bold text-t1",
          )}
        >
          {project.drawingNumber}
        </p>
        <p
          className={cn(
            "text-xs mt-0.5 truncate",
            selected ? "text-t2" : "text-t3",
          )}
        >
          {contextLine}
        </p>
      </div>

      <div role="cell" className="min-w-0 px-4 py-3">
        <p className={cn("text-sm truncate", selected ? "font-medium text-t1" : "font-medium text-t1")}>
          {project.clientCompany || "—"}
        </p>
        <p className={cn("text-xs mt-0.5 truncate", selected ? "text-t2" : "text-t3")}>
          {site}
        </p>
      </div>

      <div
        role="cell"
        className="px-4 py-3 min-w-0"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <p className="text-xs font-medium tracking-wide text-t2 truncate">
          {project.currentWorkLabel}
        </p>
        <div className="mt-1">
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
              size="lg"
              className="[&_span]:shadow-sm"
              onStatusChanged={next => onStatusChanged?.(project.id, next)}
            />
          ) : (
            <p className="text-sm text-t3">{project.currentWorkDetail}</p>
          )}
        </div>
      </div>

      <div
        role="cell"
        className={cn(
          "px-4 py-3 text-right text-sm font-medium tabular-nums",
          selected ? "text-t1" : "text-t1",
        )}
      >
        {formatGBP(project.value)}
      </div>
    </div>
  )
})
