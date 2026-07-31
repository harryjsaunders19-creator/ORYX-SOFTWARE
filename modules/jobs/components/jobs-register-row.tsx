"use client"

import { memo } from "react"
import { AlertTriangle, MoreHorizontal } from "lucide-react"
import {
  cn,
  getRevisionDueInfo,
  revisionDueToneClass,
} from "@/shared/utils/utils"
import {
  drawingSecondaryContext,
  registerRevisionBadge,
  siteDisplay,
} from "./jobs-register-helpers"
import { RevisionBadge } from "./revision-badge"
import { ClientSiteCell } from "./client-site-cell"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusCompleteLabel } from "./drawing-status-badge"
import { StagePipeline } from "./engineering-workflow-indicator"
import {
  getEngineeringStageFromDrawingStatus,
} from "@/modules/jobs/lib/engineering-workflow"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

export const REGISTER_GRID =
  "grid grid-cols-[minmax(8rem,1.15fr)_minmax(10rem,1.35fr)_minmax(7.5rem,1fr)_minmax(6.5rem,0.9fr)_minmax(5.75rem,0.8fr)_2.25rem]"

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

function RegisterDueCell({
  requiredByDate,
  completed,
}: {
  requiredByDate: string | null
  completed: boolean
}) {
  const due = getRevisionDueInfo(requiredByDate, { completed })
  const tone = revisionDueToneClass(due.severity)
  const showIcon = due.severity === "overdue" || due.severity === "orange"
  const absoluteLine =
    due.severity === "none" ? "No Due Date" : `Due ${due.shortDateLabel}`
  const relativeLine =
    due.severity === "none"
      ? null
      : due.severity === "complete"
        ? null
        : due.daysLabel

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-col items-start gap-0.5 rounded-md border px-2 py-1",
        "leading-tight tabular-nums",
        tone.text,
        tone.tint,
        tone.border,
      )}
      title={due.dateLabel !== "—" ? due.dateLabel : absoluteLine}
    >
      <span className="inline-flex min-w-0 items-center gap-1">
        {showIcon ? (
          <AlertTriangle className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        ) : null}
        <span className="min-w-0 truncate text-[12px] font-bold">{absoluteLine}</span>
      </span>
      {relativeLine ? (
        <span className="truncate text-[10px] font-semibold opacity-90">{relativeLine}</span>
      ) : null}
    </span>
  )
}

export const JobsRegisterRow = memo(function JobsRegisterRow({
  project,
  selected,
  rowIndex = 0,
  workItemsModel,
  designers,
  highlightQuery,
  style,
  onSelect,
  onOpenWorkspace,
  onStatusChanged,
  onDesignerChanged,
}: JobsRegisterRowProps) {
  const site = siteDisplay(project.siteName, project.address)
  const canEdit = project.currentWorkType !== "none" && Boolean(project.detailId)
  const patchUrl = workItemsModel && project.kind === "work_item"
    ? `/api/work-items/${project.detailId}`
    : undefined
  const revBadge = registerRevisionBadge(project)
  const secondary = drawingSecondaryContext(project)
  const stage = getEngineeringStageFromDrawingStatus(project.currentStatus, {
    closed: project.currentWorkType === "none",
  })
  const due = getRevisionDueInfo(project.requiredByDate, {
    completed: project.currentWorkType === "none",
  })
  const zebra = !selected && rowIndex % 2 === 1
  const urgencyAccent =
    !selected && due.severity === "overdue"
      ? "border-l-dn"
      : !selected && due.severity === "orange"
        ? "border-l-wn-ic/80"
        : !selected && due.severity === "amber"
          ? "border-l-yl/60"
          : null

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
        REGISTER_GRID,
        "group items-center gap-0 border-b border-bd/40 px-0 cursor-pointer",
        "transition-[background-color,box-shadow,border-color] duration-150 ease-out",
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac",
        selected
          ? "bg-sel-bg border-l-4 border-l-sel-bd"
          : cn(
              "border-l-4 hover:bg-surface-low",
              urgencyAccent ?? "border-l-transparent",
              zebra && "bg-surface-low/70",
            ),
      )}
    >
      <div role="cell" className="min-w-0 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[15px] font-bold tabular-nums tracking-tight text-t1">
            {project.drawingNumber}
          </p>
          {revBadge ? <RevisionBadge>{revBadge}</RevisionBadge> : null}
        </div>
          {secondary ? (
          <p className="mt-0.5 truncate text-[11px] font-normal text-t3">
            {secondary}
          </p>
        ) : null}
      </div>

      <div role="cell" className="min-w-0 px-3 py-1.5">
        <ClientSiteCell
          clientName={project.clientCompany}
          siteName={site}
          highlightQuery={highlightQuery}
          variant="register"
          selected={selected}
        />
      </div>

      <div
        role="cell"
        className="min-w-0 px-3 py-1.5"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {canEdit ? (
          <div className="flex min-w-0 flex-col gap-1">
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
            <StagePipeline stageId={stage.id} className="pl-0.5" />
          </div>
        ) : (
          <div className="min-w-0">
            <DrawingStatusCompleteLabel />
            <StagePipeline stageId="complete" className="mt-1 pl-0.5" />
          </div>
        )}
      </div>

      <div
        role="cell"
        className="min-w-0 px-3 py-1.5"
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
            unassignedLabel="Assign designer"
            onDesignerChanged={next => onDesignerChanged?.(project.id, next)}
          />
        ) : (
          <p className={cn("truncate text-sm", project.designer?.trim() ? "text-t1" : "text-t2")}>
            {project.designer?.trim() || "Unassigned"}
          </p>
        )}
      </div>

      <div role="cell" className="min-w-0 px-2 py-1.5">
        <RegisterDueCell
          requiredByDate={project.requiredByDate}
          completed={project.currentWorkType === "none"}
        />
      </div>

      <div
        role="cell"
        className="flex items-center justify-center px-1"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "rounded-md p-1.5 text-t3 transition-colors",
                "hover:bg-surface-low hover:text-t1",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac",
                "opacity-70 group-hover:opacity-100 data-[state=open]:opacity-100 data-[state=open]:bg-surface-low data-[state=open]:text-t1",
              )}
              aria-label={`Actions for ${project.drawingNumber}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onOpenWorkspace(project.id)}>
              Open Full Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
})
