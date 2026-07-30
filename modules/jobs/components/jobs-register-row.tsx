"use client"

import { memo } from "react"
import { MoreHorizontal } from "lucide-react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { drawingNumberContext, siteDisplay } from "./jobs-register-helpers"
import { ClientSiteCell } from "./client-site-cell"
import type { JobsRegisterProject } from "./jobs-register-types"
import { REGISTER_ROW_H } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusCompleteLabel } from "./drawing-status-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

export const REGISTER_GRID =
  "grid grid-cols-[minmax(8rem,1.1fr)_minmax(12rem,1.55fr)_minmax(7rem,0.95fr)_minmax(6.5rem,0.85fr)_5.5rem_2.25rem]"

interface JobsRegisterRowProps {
  project: JobsRegisterProject
  selected: boolean
  workItemsModel: boolean
  designers: string[]
  highlightQuery?: string
  style?: React.CSSProperties
  onSelect: (id: string) => void
  onOpenWorkspace: (id: string) => void
  onStatusChanged?: (projectId: string, nextStatus: string) => void
  onDesignerChanged?: (projectId: string, nextDesigner: string) => void
}

export const JobsRegisterRow = memo(function JobsRegisterRow({
  project,
  selected,
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
  const contextLine = drawingNumberContext(project)
  const workLabel =
    project.currentWorkType === "revision"
      ? project.currentWorkLabel
      : project.currentWorkType === "original"
        ? "Original"
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
        "group items-center gap-0 border-b border-bd/40 px-0 cursor-pointer transition-colors duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ac2",
        selected
          ? "bg-ac2-bg/70 border-l-[3px] border-l-ac2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-ac2)_22%,transparent)]"
          : "border-l-[3px] border-l-transparent hover:bg-surface-low",
      )}
    >
      <div role="cell" className="min-w-0 px-3 py-2.5">
        <p className="truncate text-sm font-bold text-t1">{project.drawingNumber}</p>
        <p className={cn("mt-0.5 truncate text-xs", selected ? "text-t2" : "text-t3")}>
          {contextLine}
        </p>
      </div>

      <div role="cell" className="min-w-0 px-3 py-2.5">
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
        className="min-w-0 px-3 py-2.5"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        {canEdit ? (
          <div className="flex min-w-0 flex-col gap-1">
            {workLabel && (
              <span className="truncate text-xs font-medium text-t2">{workLabel}</span>
            )}
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
          </div>
        ) : (
          <DrawingStatusCompleteLabel />
        )}
      </div>

      <div
        role="cell"
        className="min-w-0 px-3 py-2.5"
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
            onDesignerChanged={next => onDesignerChanged?.(project.id, next)}
          />
        ) : (
          <p className="truncate text-xs text-t3">
            {project.designer || "—"}
          </p>
        )}
      </div>

      <div role="cell" className="px-3 py-2.5 text-right text-sm font-medium tabular-nums text-t1">
        {formatGBP(project.value)}
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
              className="rounded p-1.5 text-t3 transition-colors hover:bg-surface-low hover:text-t1"
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
