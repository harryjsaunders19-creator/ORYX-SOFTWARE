"use client"

import { memo } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { registerWorkTypeLabel } from "./jobs-register-helpers"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusCompleteLabel } from "./drawing-status-badge"
import {
  getDrawingStatusBadgeClass,
  getDrawingStatusColour,
  getDrawingStatusLabel,
} from "@/modules/jobs/lib/drawing-status-colours"

export const REGISTER_GRID =
  "grid grid-cols-[minmax(9rem,1.2fr)_minmax(8rem,1.1fr)_minmax(8rem,1.1fr)_minmax(8rem,1fr)_minmax(7rem,0.9fr)_2.5rem]"

interface JobsRegisterRowProps {
  project: JobsRegisterProject
  selected: boolean
  /** Zero-based index for zebra striping. */
  rowIndex?: number
  workItemsModel: boolean
  designers: string[]
  highlightQuery?: string
  style?: React.CSSProperties
  onSelect: (id: string) => void
  onOpenWorkspace: (id: string) => void
  onStatusChanged?: (projectId: string, nextStatus: string) => void
  onDesignerChanged?: (projectId: string, nextDesigner: string) => void
}

function StatusPill({ status }: { status: string }) {
  const colour = getDrawingStatusColour(status)
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        getDrawingStatusBadgeClass(status),
      )}
    >
      <span className={cn("mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full", colour.dot)} aria-hidden />
      <span className="truncate">{getDrawingStatusLabel(status)}</span>
    </span>
  )
}

export const JobsRegisterRow = memo(function JobsRegisterRow({
  project,
  selected,
  rowIndex = 0,
  workItemsModel,
  designers,
  highlightQuery: _highlightQuery,
  style,
  onSelect,
  onOpenWorkspace,
  onStatusChanged,
  onDesignerChanged,
}: JobsRegisterRowProps) {
  void _highlightQuery
  const site = (project.siteName?.trim() || project.address?.trim() || "—")
  const canEdit = project.currentWorkType !== "none" && Boolean(project.detailId)
  const patchUrl = workItemsModel && project.kind === "work_item"
    ? `/api/work-items/${project.detailId}`
    : undefined
  const workType = registerWorkTypeLabel(project)
  const zebra = !selected && rowIndex % 2 === 1

  return (
    <div
      role="row"
      aria-selected={selected}
      tabIndex={0}
      data-selected={selected ? "true" : undefined}
      style={{ ...style, height: REGISTER_ROW_H }}
      onClick={() => onSelect(project.id)}
      onDoubleClick={() => onOpenWorkspace(project.id)}
      onKeyDown={e => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault()
          onSelect(project.id)
        }
      }}
      className={cn(
        REGISTER_GRID,
        "group items-center gap-0 border-b border-jobs-panel-bd/70 px-0 cursor-pointer",
        "transition-[background-color,border-color,box-shadow] duration-150 ease-out",
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac",
        selected
          ? "border-l-[3px] border-l-t1 border-b border-b-jobs-panel-bd bg-jobs-row-selected"
          : cn(
              "border-l-[3px] border-l-transparent hover:bg-jobs-row-hover",
              zebra && "bg-jobs-row-hover/50",
            ),
      )}
    >
      <div role="cell" className="min-w-0 px-6 py-3">
        <p className="min-w-0 truncate text-[16px] font-bold tabular-nums tracking-tight text-t1">
          {project.drawingNumber}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-t3">
          {workType}
        </p>
      </div>

      <div role="cell" className="min-w-0 px-6 py-3">
        <p className="truncate text-sm text-t1">{project.clientCompany || "—"}</p>
      </div>

      <div role="cell" className="min-w-0 px-6 py-3">
        <p className="truncate text-sm text-t2">{site}</p>
      </div>

      <div
        role="cell"
        className="min-w-0 px-6 py-3"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {canEdit ? (
          <WorkItemStatusSelector
            workItemType={project.currentWorkType === "revision" ? "revision" : "original"}
            workItemId={project.detailId}
            currentStatus={project.currentStatus}
            revisionLabel={
              project.currentWorkType === "revision" ? project.currentWorkLabel : null
            }
            patchUrl={patchUrl}
            size="md"
            onStatusChanged={next => onStatusChanged?.(project.id, next)}
          />
        ) : project.currentWorkType === "none" ? (
          <DrawingStatusCompleteLabel />
        ) : (
          <StatusPill status={project.currentStatus} />
        )}
      </div>

      <div
        role="cell"
        className="min-w-0 px-6 py-3"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {canEdit ? (
          <DesignerAssignmentSelector
            workItemType={project.currentWorkType === "revision" ? "revision" : "original"}
            workItemId={project.detailId}
            currentDesigner={project.designer}
            revisionLabel={
              project.currentWorkType === "revision" ? project.currentWorkLabel : null
            }
            designers={designers}
            patchUrl={patchUrl}
            compact
            unassignedLabel="Unassigned"
            onDesignerChanged={next => onDesignerChanged?.(project.id, next)}
          />
        ) : (
          <p className={cn("truncate text-sm", project.designer?.trim() ? "text-t1" : "text-t3")}>
            {project.designer?.trim() || "Unassigned"}
          </p>
        )}
      </div>

      <div role="cell" className="flex items-center justify-end px-4">
        <ChevronRight
          className="h-5 w-5 text-t3 opacity-0 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100"
          aria-hidden
        />
      </div>
    </div>
  )
})
