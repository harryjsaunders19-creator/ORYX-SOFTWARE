"use client"

import { memo } from "react"
import { cn, getRevisionDueInfo, revisionDueToneClass } from "@/shared/utils/utils"
import { siteDisplay } from "./jobs-register-helpers"
import { ClientSiteCell } from "./client-site-cell"
import type { JobsRegisterProject } from "./jobs-register-types"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusCompleteLabel } from "./drawing-status-badge"
import { getEngineeringStageFromDrawingStatus } from "@/modules/jobs/lib/engineering-workflow"

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
  const workType = project.currentWorkType === "revision" ? "revision" : "original"
  const revBadge =
    project.currentWorkType === "revision" && project.currentRevisionLetter
      ? `Rev ${project.currentRevisionLetter}`
      : project.currentWorkType === "original"
        ? "Original"
        : null
  const stage = getEngineeringStageFromDrawingStatus(project.currentStatus, {
    closed: project.currentWorkType === "none",
  })
  const due = getRevisionDueInfo(project.requiredByDate, {
    completed: project.currentWorkType === "none",
  })
  const dueTone = revisionDueToneClass(due.severity)

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
        "w-full min-w-0 rounded-lg border bg-sr p-3.5 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ac2",
        selected
          ? "border-ac2 bg-ac2-bg/40 shadow-[inset_3px_0_0_0_var(--color-ac2)]"
          : "border-bd",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-base font-bold leading-snug tracking-tight text-t1 [overflow-wrap:anywhere]">
          {project.drawingNumber}
        </h3>
        {revBadge ? (
          <span className="shrink-0 rounded-md border border-bd bg-surface-low px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-t2">
            {revBadge}
          </span>
        ) : null}
      </div>

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
            workItemType={workType}
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
        <p className="mt-1 text-[11px] text-t3">
          Stage: <span className="font-semibold text-t2">{stage.label}</span>
        </p>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-bd/60 pt-3">
        <div
          className="min-w-0 flex-1"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-t4">Designer</p>
          {canEdit ? (
            <DesignerAssignmentSelector
              workItemType={workType}
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
            <p className={cn("text-sm", project.designer?.trim() ? "text-t2" : "text-t3")}>
              {project.designer?.trim() || "Unassigned"}
            </p>
          )}
        </div>
        <div className={cn("shrink-0 rounded-md px-2 py-1 text-right", dueTone.tint)}>
          <p className={cn("text-xs font-bold", dueTone.text)}>
            {due.severity === "none" || due.severity === "complete"
              ? due.registerPrimary
              : due.daysLabel}
          </p>
          {due.severity !== "none" && due.severity !== "complete" ? (
            <p className={cn("mt-0.5 text-[11px] font-medium", dueTone.text)}>{due.shortDateLabel}</p>
          ) : due.registerSecondary ? (
            <p className={cn("mt-0.5 text-[11px] font-semibold", dueTone.text)}>{due.registerSecondary}</p>
          ) : null}
        </div>
      </div>
    </article>
  )
})
