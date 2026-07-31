"use client"

import { memo } from "react"
import {
  cn,
  formatRevisionDueCompact,
  getRevisionDueInfo,
  revisionDueToneClass,
} from "@/shared/utils/utils"
import { registerRevisionBadge, siteDisplay } from "./jobs-register-helpers"
import { RevisionBadge } from "./revision-badge"
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
  const workType = project.currentWorkType === "revision" ? "revision" : "original"
  const revBadge = registerRevisionBadge(project)
  const stage = getEngineeringStageFromDrawingStatus(project.currentStatus, {
    closed: project.currentWorkType === "none",
  })
  const due = getRevisionDueInfo(project.requiredByDate, {
    completed: project.currentWorkType === "none",
  })
  const dueTone = revisionDueToneClass(due.severity)
  const dueLabel = formatRevisionDueCompact(due)
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
        "w-full min-w-0 rounded-lg border bg-s1 p-3.5 text-left outline-none",
        "transition-[background-color,box-shadow,border-color] duration-150 ease-out",
        "cursor-pointer focus-visible:ring-2 focus-visible:ring-ac",
        selected
          ? "border-sel-bd/40 bg-sel-bg shadow-[inset_3px_0_0_0_var(--color-sel-bd)]"
          : cn(
              "border-bd hover:bg-surface-low",
              due.severity === "overdue" && "shadow-[inset_3px_0_0_0_var(--color-dn)]",
              due.severity === "orange" && "shadow-[inset_3px_0_0_0_color-mix(in_srgb,var(--color-wn-ic)_80%,transparent)]",
            ),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-base font-bold leading-snug tracking-tight text-t1 tabular-nums [overflow-wrap:anywhere]">
          {project.drawingNumber}
        </h3>
        {revBadge ? <RevisionBadge>{revBadge}</RevisionBadge> : null}
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
            stageLabel={stage.label}
            patchUrl={patchUrl}
            size="lg"
            disabled={!canEdit}
            onStatusChanged={() => onStatusChanged?.()}
          />
        )}
        <StagePipeline stageId={stage.id} className="mt-1.5" />
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-bd/60 pt-3">
        <div
          className="min-w-0 flex-1"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-t2">Designer</p>
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
              unassignedLabel="Assign designer…"
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
            "inline-flex max-w-[50%] shrink-0 items-center gap-1 rounded-full border px-2 py-1",
            dueTone.tint,
            dueTone.border,
          )}
        >
          {showDueIcon ? (
            <AlertTriangle className={cn("h-3 w-3 shrink-0", dueTone.text)} aria-hidden />
          ) : null}
          <p className={cn("truncate text-[11px] font-bold tabular-nums", dueTone.text)}>
            {dueLabel}
          </p>
        </div>
      </div>
    </article>
  )
})
