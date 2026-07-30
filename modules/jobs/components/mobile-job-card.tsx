"use client"

import { memo } from "react"
import { formatGBP, cn } from "@/shared/utils/utils"
import { siteDisplay } from "./jobs-register-helpers"
import { ClientSiteCell } from "./client-site-cell"
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
  const revisionMeta =
    project.revisionCount <= 0
      ? "No revisions"
      : project.revisionCount === 1
        ? "1 revision"
        : `${project.revisionCount} revisions`
  const revBadge =
    project.currentWorkType === "revision" && project.currentRevisionLetter
      ? `Rev ${project.currentRevisionLetter}`
      : project.currentWorkType === "original"
        ? "Original"
        : null

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
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-bd/60 pt-3">
        <div
          className="min-w-0 flex-1"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          <p className="mb-1 text-xs text-t3">Designer</p>
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
              onDesignerChanged={() => onDesignerChanged?.()}
            />
          ) : (
            <p className="text-sm text-t2">{project.designer?.trim() || "Unassigned"}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-t3">
            {revBadge && project.currentWorkType === "revision"
              ? `${revBadge} · ${revisionMeta}`
              : revisionMeta}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-t1">
            {project.value == null ? "£—" : formatGBP(project.value)}
          </p>
        </div>
      </div>
    </article>
  )
})
