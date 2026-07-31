"use client"

import { memo } from "react"
import {
  cn,
  getRevisionDueInfo,
  revisionDueToneClass,
} from "@/shared/utils/utils"
import { registerWorkTypeLabel, siteDisplay } from "./jobs-register-helpers"
import { ClientSiteCell } from "./client-site-cell"
import type { JobsRegisterProject } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusCompleteLabel } from "./drawing-status-badge"
import { StagePipeline } from "./engineering-workflow-indicator"
import { getEngineeringStageFromDrawingStatus } from "@/modules/jobs/lib/engineering-workflow"
import { AlertTriangle } from "lucide-react"

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
  highlightQuery,
  onSelect,
  onStatusChanged,
  onDesignerChanged,
}: Props) {
  const site = siteDisplay(project.siteName, project.address)
  const canEdit = project.currentWorkType !== "none" && Boolean(project.detailId)
  const patchUrl = workItemsModel && project.kind === "work_item"
    ? `/api/work-items/${project.detailId}`
    : undefined
  const workItemType = project.currentWorkType === "revision" ? "revision" : "original"
  const workType = registerWorkTypeLabel(project)
  const stage = getEngineeringStageFromDrawingStatus(project.currentStatus, {
    closed: project.currentWorkType === "none",
  })
  const due = getRevisionDueInfo(project.requiredByDate, {
    completed: project.currentWorkType === "none",
  })
  const dueTone = revisionDueToneClass(due.severity)
  const absoluteLine =
    due.severity === "none" ? "No Due Date" : `Due ${due.shortDateLabel}`
  const relativeLine =
    due.severity === "none"
      ? "—"
      : due.severity === "complete"
        ? "Completed"
        : due.daysLabel
  const showDueIcon = due.severity === "overdue" || due.severity === "orange"

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
        "w-full min-w-0 rounded-xl border bg-s1 p-4 text-left outline-none",
        "shadow-[0px_4px_20px_rgba(0,0,0,0.04)]",
        "transition-[background-color,box-shadow,border-color] duration-150 ease-out",
        "cursor-pointer focus-visible:ring-2 focus-visible:ring-ac",
        selected
          ? "border-t1/20 bg-t1/[0.03] shadow-[inset_4px_0_0_0_var(--color-t1)]"
          : cn(
              "border-bd/80 hover:bg-surface-low",
              due.severity === "overdue" && "shadow-[inset_3px_0_0_0_var(--color-dn)]",
              due.severity === "orange" && "shadow-[inset_3px_0_0_0_color-mix(in_srgb,var(--color-wn-ic)_80%,transparent)]",
            ),
      )}
    >
      <h3 className="min-w-0 text-base font-bold leading-snug tracking-tight text-t1 tabular-nums [overflow-wrap:anywhere]">
        {project.drawingNumber}
      </h3>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-t2">
        {workType}
      </p>

      <ClientSiteCell
        className="mt-1.5"
        clientName={project.clientCompany}
        siteName={site}
        highlightQuery={highlightQuery}
        variant="card"
        selected={selected}
      />

      <div
        className="mt-3 min-h-11"
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
            size="lg"
            disabled={!canEdit}
            onStatusChanged={() => onStatusChanged?.()}
          />
        )}
        <StagePipeline stageId={stage.id} className="mt-1" />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-bd/60 pt-3">
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
              unassignedLabel="Assign designer"
              onDesignerChanged={() => onDesignerChanged?.()}
            />
          ) : (
            <p className={cn("text-sm", project.designer?.trim() ? "text-t2" : "text-t2")}>
              {project.designer?.trim() || "Unassigned"}
            </p>
          )}
        </div>
        <div
          className={cn(
            "inline-flex h-[2.75rem] w-[7.5rem] min-w-[7.5rem] shrink-0 flex-col items-end justify-center gap-0.5 rounded-md border px-2.5 py-1 text-right",
            dueTone.tint,
            dueTone.border,
          )}
        >
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium tabular-nums opacity-90", dueTone.text)}>
            {showDueIcon ? (
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            ) : null}
            {absoluteLine}
          </span>
          <span className={cn("text-[12px] font-bold tabular-nums leading-tight", dueTone.text)}>
            {relativeLine}
          </span>
        </div>
      </div>
    </article>
  )
})
