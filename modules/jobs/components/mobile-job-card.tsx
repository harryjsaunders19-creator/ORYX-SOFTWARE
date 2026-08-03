"use client"

import { memo } from "react"
import {
  cn,
  getRevisionDueInfo,
} from "@/shared/utils/utils"
import { registerWorkTypeLabel, siteDisplay } from "./jobs-register-helpers"
import type { JobsRegisterProject } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusCompleteLabel } from "./drawing-status-badge"

type Props = {
  project: JobsRegisterProject
  selected: boolean
  workItemsModel: boolean
  designers: string[]
  highlightQuery?: string
  onSelect: (id: string) => void
  onStatusChanged?: () => void
  onDesignerChanged?: () => void
}

export const MobileJobCard = memo(function MobileJobCard({
  project,
  selected,
  workItemsModel,
  designers,
  highlightQuery: _highlightQuery,
  onSelect,
  onStatusChanged,
  onDesignerChanged,
}: Props) {
  void _highlightQuery
  const site = siteDisplay(project.siteName, project.address)
  const canEdit = project.currentWorkType !== "none" && Boolean(project.detailId)
  const patchUrl = workItemsModel && project.kind === "work_item"
    ? `/api/work-items/${project.detailId}`
    : undefined
  const workItemType = project.currentWorkType === "revision" ? "revision" : "original"
  const workType = registerWorkTypeLabel(project)
  const due = getRevisionDueInfo(project.requiredByDate, {
    completed: project.currentWorkType === "none",
  })
  const dueLine =
    due.severity === "none"
      ? null
      : due.severity === "complete"
        ? `Completed ${due.shortDateLabel}`
        : `Due ${due.shortDateLabel}${due.daysLabel ? ` · ${due.daysLabel}` : ""}`

  return (
    <article
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      aria-label={`Open ${project.drawingNumber}`}
      onClick={() => onSelect(project.id)}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect(project.id)
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-xl border border-bd bg-s1 p-4 text-left outline-none",
        "shadow-[0px_4px_20px_rgba(0,0,0,0.04)]",
        "transition-[border-color,box-shadow] duration-150 ease-out",
        "cursor-pointer focus-visible:ring-2 focus-visible:ring-ac",
        selected
          ? "border-l-4 border-l-jobs-row-selected-accent border-bd bg-jobs-row-selected"
          : "border-l-4 border-l-transparent hover:border-bd hover:bg-jobs-row-hover",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="min-w-0 text-base font-bold leading-snug tracking-tight text-t1 tabular-nums [overflow-wrap:anywhere]">
            {project.drawingNumber}
          </h3>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-t3">
            {workType}
          </p>
        </div>
        <div
          className="shrink-0"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {project.currentWorkType === "none" ? (
            <DrawingStatusCompleteLabel detail={project.currentWorkDetail || "No active work"} />
          ) : (
            <WorkItemStatusSelector
              workItemType={workItemType}
              workItemId={project.detailId}
              currentStatus={project.currentStatus}
              revisionLabel={
                project.currentWorkType === "revision" ? project.currentWorkLabel : null
              }
              patchUrl={patchUrl}
              size="md"
              disabled={!canEdit}
              onStatusChanged={() => onStatusChanged?.()}
            />
          )}
        </div>
      </div>

      <p className="mt-3 truncate text-sm text-t1">
        {project.clientCompany || "—"}
      </p>
      <p className="mt-0.5 truncate text-sm text-t3">{site}</p>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-bd/50 pt-3">
        <div
          className="min-w-0 flex-1"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-t3">
            Designer
          </p>
          {canEdit ? (
            <DesignerAssignmentSelector
              workItemType={workItemType}
              workItemId={project.detailId}
              currentDesigner={project.designer}
              revisionLabel={
                project.currentWorkType === "revision" ? project.currentWorkLabel : null
              }
              designers={designers}
              patchUrl={patchUrl}
              compact
              unassignedLabel="Unassigned"
              onDesignerChanged={() => onDesignerChanged?.()}
            />
          ) : (
            <p className="truncate text-sm text-t1">
              {project.designer?.trim() || "Unassigned"}
            </p>
          )}
        </div>
        {dueLine ? (
          <p className="shrink-0 text-right text-xs tabular-nums text-t3">
            {dueLine}
          </p>
        ) : null}
      </div>
    </article>
  )
})
