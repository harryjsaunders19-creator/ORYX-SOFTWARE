"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Pencil } from "lucide-react"
import { cn, getRevisionDueInfo, revisionDueToneClass } from "@/shared/utils/utils"
import {
  EmptyStateCard,
  infoCardClassName,
  PropertyCell,
  PropertyGrid,
  inspectorType,
} from "@/shared/layouts/inspector"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { StagePipeline } from "./engineering-workflow-indicator"
import { getEngineeringStageFromDrawingStatus } from "@/modules/jobs/lib/engineering-workflow"
import {
  getDrawingStatusColour,
  getDrawingStatusLabel,
} from "@/modules/jobs/lib/drawing-status-colours"
import type { getCurrentWorkItem } from "@/modules/jobs/lib/current-work"
import type { LinkedQuoteSummary } from "@/lib/types"
import { ClientSiteCell } from "./client-site-cell"
import { useToast } from "@/shared/ui/toast"

export const sectionHeading = inspectorType.sectionHeading
export const fieldLabel = inspectorType.fieldLabel
export const fieldValue = inspectorType.fieldValue
export const fieldMuted = inspectorType.fieldMuted

/** @deprecated Prefer InfoCard / infoCardClassName from shared/layouts/inspector. */
export const inspectorContentCard = infoCardClassName
export const informationCardClassName = infoCardClassName

/** Section boundary — spacing-first, with a calm divider. */
export const inspectorSectionRule = "border-t border-inspector-divider pt-6"

export function safeDateLabel(value: string | null | undefined): string {
  if (!value) return ""
  const raw = value.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number)
    const date = new Date(y!, (m ?? 1) - 1, d ?? 1)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function dueLabel(value: string | null | undefined): string {
  if (!value) return "Not set"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "Not set"
  const absolute = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0) return `Overdue · ${absolute}`
  if (diff === 0) return `Today · ${absolute}`
  if (diff === 1) return `Tomorrow · ${absolute}`
  if (diff <= 7) return `This week · ${absolute}`
  return absolute
}

function Meta({
  label,
  value,
  important,
}: {
  label: string
  value: string | null | undefined
  important?: boolean
}) {
  const trimmed = typeof value === "string" ? value.trim() : value
  if (!trimmed && !important) return null
  return (
    <div>
      <p className={cn(fieldLabel, "mb-1 text-t4")}>{label}</p>
      <p className={cn(trimmed ? "text-sm text-t2" : fieldMuted, "whitespace-pre-wrap")}>
        {trimmed || "—"}
      </p>
    </div>
  )
}

/** Compact semantic status chip for the inspector header. */
export function StatusChip({
  prefix,
  status,
  stageLabel,
  emptyLabel,
  tone = "primary",
}: {
  /** Optional context prefix. Omit for primary revision status (status only). */
  prefix?: string
  status?: string | null
  /** When set, shown as "Status · Stage" (reduces Stage line redundancy). */
  stageLabel?: string | null
  emptyLabel?: string
  /** Primary = revision/current work; secondary = parent/project context. */
  tone?: "primary" | "secondary"
}) {
  const statusText = status
    ? getDrawingStatusLabel(status)
    : (emptyLabel ?? "—")
  const withStage =
    stageLabel?.trim() && !prefix
      ? `${statusText} · ${stageLabel.trim()}`
      : statusText
  const display = prefix ? `${prefix}: ${withStage}` : withStage

  if (!status) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-t2",
          tone === "primary" ? "border border-bd bg-s1" : "border border-transparent bg-transparent text-t3",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-t3" aria-hidden />
        {display}
      </span>
    )
  }
  const colour = getDrawingStatusColour(status)
  if (tone === "secondary") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-t2">
        <span className="h-1.5 w-1.5 rounded-full bg-t3" aria-hidden />
        {display}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        colour.text,
        colour.tint,
        "border-bd/60",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colour.dot)} aria-hidden />
      {display}
    </span>
  )
}

/** Compact state strip under the drawing title — revision + due only (no status/stage repeat). */
export function RevisionSummaryStrip({
  revision,
  designer,
  duePrimary,
  dueSeverity,
}: {
  revision: string
  /** @deprecated Stage is shown via Status badge + Stage Pipeline — ignored. */
  stage?: string
  designer: string
  duePrimary: string
  dueSeverity: ReturnType<typeof getRevisionDueInfo>["severity"]
  /** @deprecated Status colour lives on the header StatusChip — ignored. */
  stageStatus?: string | null
}) {
  const dueTone = revisionDueToneClass(dueSeverity)
  const hasDesigner = Boolean(designer.trim())
  const designerLabel = hasDesigner ? designer.trim() : null
  const emphasizeDue =
    dueSeverity === "overdue" || dueSeverity === "orange" || dueSeverity === "amber"

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-md border border-inspector-card-bd bg-inspector-card px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-t1 tabular-nums">
        {revision}
      </span>
      {designerLabel ? (
        <span className="inline-flex items-center rounded-md bg-surface-low px-2 py-1 text-[11px] font-medium text-t2">
          {designerLabel}
        </span>
      ) : null}
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold tabular-nums",
          dueTone.text,
          dueTone.border,
          emphasizeDue ? dueTone.tint : "bg-transparent",
        )}
      >
        {duePrimary}
      </span>
    </div>
  )
}

export function InspectorHeader({
  drawingNumber,
  revisionBadge,
  client,
  site,
  statusChips,
  summaryStrip,
  moreSlot,
  collapseSlot,
  leadingSlot,
  dense,
  children,
}: {
  drawingNumber: string
  revisionBadge: string | null
  client: string
  site: string
  statusChips: ReactNode
  summaryStrip?: ReactNode
  moreSlot?: ReactNode
  collapseSlot?: ReactNode
  leadingSlot?: ReactNode
  dense?: boolean
  children: ReactNode
}) {
  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-inspector-divider bg-s2/95 px-7 pt-5 pb-5 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {leadingSlot}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={cn(
                  "font-bold tracking-tight text-t1 tabular-nums",
                  dense
                    ? "text-lg leading-snug [overflow-wrap:anywhere]"
                    : "truncate text-[22px]",
                )}
              >
                {drawingNumber}
              </h3>
              {revisionBadge && (
                <span className="inline-flex items-center rounded-md border border-bd/70 bg-inspector-card px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-t2 tabular-nums">
                  {revisionBadge}
                </span>
              )}
            </div>
            <ClientSiteCell
              className="mt-3"
              clientName={client}
              siteName={site}
              variant="header"
              showSiteIcon={false}
            />
            {summaryStrip}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {collapseSlot}
          {moreSlot}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">{statusChips}</div>
      <div className="mt-5">{children}</div>
    </div>
  )
}

/** Editable target due date for the active work item / revision. */
function EditableTargetDue({
  workItemId,
  patchUrl,
  requiredByDate,
  completed,
  disabled,
  onChanged,
}: {
  workItemId: string
  patchUrl?: string
  requiredByDate: string | null
  completed: boolean
  disabled?: boolean
  onChanged: () => void
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined)
  const value = optimistic !== undefined ? optimistic : requiredByDate
  const due = getRevisionDueInfo(value, { completed })

  useEffect(() => {
    setOptimistic(undefined)
  }, [requiredByDate])

  useEffect(() => {
    if (editing) inputRef.current?.showPicker?.()
  }, [editing])

  const save = useCallback(async (next: string) => {
    if (busy || disabled) return
    const trimmed = next.trim()
    if (!trimmed) {
      setEditing(false)
      return
    }
    const current = (optimistic !== undefined ? optimistic : requiredByDate)?.slice(0, 10) ?? ""
    if (trimmed === current) {
      setEditing(false)
      return
    }
    const previous = requiredByDate
    setBusy(true)
    setOptimistic(trimmed)
    setEditing(false)
    try {
      const res = await fetch(patchUrl ?? `/api/jobs/${workItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredByDate: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to update due date", "error")
        setOptimistic(previous)
        return
      }
      toast("Due date updated", "success")
      onChanged()
    } catch {
      toast("Network error", "error")
      setOptimistic(previous)
    } finally {
      setBusy(false)
    }
  }, [busy, disabled, onChanged, optimistic, patchUrl, requiredByDate, toast, workItemId])

  const absoluteLine =
    due.severity === "none" ? "No due date set" : `Due ${due.shortDateLabel}`
  const relativeLine =
    due.severity === "none"
      ? null
      : due.severity === "complete"
        ? "Completed"
        : due.daysLabel

  return (
    <PropertyCell label="Due Date">
      {editing && !disabled ? (
        <input
          ref={inputRef}
          type="date"
          className="w-full max-w-[11rem] rounded border border-bd bg-sr px-2 py-1 text-sm text-t1 outline-none focus-visible:ring-2 focus-visible:ring-ac"
          defaultValue={value?.slice(0, 10) ?? ""}
          disabled={busy}
          autoFocus
          onBlur={e => {
            if (e.target.value && e.target.value !== (value?.slice(0, 10) ?? "")) {
              void save(e.target.value)
            } else {
              setEditing(false)
            }
          }}
          onChange={e => {
            if (e.target.value) void save(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault()
              void save((e.target as HTMLInputElement).value)
            }
            if (e.key === "Escape") {
              e.preventDefault()
              setEditing(false)
            }
          }}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          disabled={disabled || busy || completed}
          onClick={e => {
            e.stopPropagation()
            if (!disabled && !completed) setEditing(true)
          }}
          className={cn(
            "group/due inline-flex max-w-full items-center gap-1.5 rounded text-left outline-none",
            "focus-visible:ring-2 focus-visible:ring-ac",
            (disabled || completed) ? "cursor-default" : "cursor-pointer hover:text-t1",
          )}
          title={completed ? "Completed" : "Edit due date"}
          aria-label="Edit due date"
        >
          <span className={cn("text-sm tabular-nums", due.severity === "none" ? "text-t3" : "font-medium text-t2")}>
            {absoluteLine}
            {relativeLine ? (
              <span className="text-t3"> · {relativeLine}</span>
            ) : null}
          </span>
          {!disabled && !completed && (
            <Pencil className="h-3 w-3 shrink-0 text-t3 opacity-0 transition-opacity group-hover/due:opacity-100 group-focus-visible/due:opacity-100" aria-hidden />
          )}
          {busy && <span className="text-[10px] text-t3">Saving…</span>}
        </button>
      )}
    </PropertyCell>
  )
}

/** Focal engineering controls for the active original or revision (no narrative card — that lives in Revision History). */
export function CurrentRevisionSection({
  currentWork,
  revLabel,
  designer,
  designers,
  lastCompleted,
  lastCompletedLabel,
  descriptionOfWorks,
  revisionReason,
  revisionDate,
  requiredByDate,
  patchUrl,
  onChanged,
}: {
  currentWork: ReturnType<typeof getCurrentWorkItem>
  revLabel: string
  designer: string
  designers: string[]
  lastCompleted: string | null
  /** e.g. "Rev D" or "Original" for the empty state. */
  lastCompletedLabel?: string | null
  descriptionOfWorks: string | null
  revisionReason: string | null
  revisionDate: string | null
  requiredByDate?: string | null
  patchUrl?: string
  onChanged: () => void
}) {
  const active = currentWork.type !== "none" && Boolean(currentWork.id)
  const isRevision = currentWork.type === "revision"
  void descriptionOfWorks
  void revisionReason
  const issuedLabel =
    currentWork.status === "ISSUED"
      ? (safeDateLabel(lastCompleted) || "Issued")
      : "Pending"
  const completed = currentWork.status === "ISSUED" || currentWork.type === "none"
  const dueSource = requiredByDate ?? currentWork.dueDate ?? null
  const completedDate = safeDateLabel(lastCompleted)
  const completedTitle = lastCompletedLabel?.trim() || null
  const stage = getEngineeringStageFromDrawingStatus(currentWork.status, {
    closed: currentWork.type === "none",
  })

  if (!active) {
    return (
      <EmptyStateCard
        eyebrow="Current work"
        title="No active drawing work"
        description={
          <>
            <p className="font-medium text-t2">Latest completed</p>
            <p>
              {completedTitle ? (
                <>
                  <span className="font-semibold text-t1">{completedTitle}</span>
                  {completedDate ? (
                    <>
                      <span className="mx-1.5 text-t4" aria-hidden>·</span>
                      Completed {completedDate}
                    </>
                  ) : null}
                </>
              ) : completedDate ? (
                <>Completed {completedDate}</>
              ) : (
                "No completed drawings yet"
              )}
            </p>
          </>
        }
      >
        Create a new revision using the button above.
      </EmptyStateCard>
    )
  }

  return (
    <section aria-label="Current work controls" className="space-y-3">
      <PropertyGrid>
        <PropertyCell label="Status" className="col-span-2">
          <div className="flex w-full flex-col gap-1.5">
            <WorkItemStatusSelector
              workItemType={isRevision ? "revision" : "original"}
              workItemId={currentWork.id!}
              currentStatus={currentWork.status}
              revisionLabel={isRevision ? currentWork.revisionLabel : null}
              patchUrl={patchUrl}
              size="md"
              onStatusChanged={onChanged}
            />
            <StagePipeline stageId={stage.id} labeled />
          </div>
        </PropertyCell>

        <PropertyCell label={isRevision ? "Revision Date" : "Date Created"}>
          <p className={cn(fieldMuted, "tabular-nums")}>
            {safeDateLabel(revisionDate) || "—"}
          </p>
        </PropertyCell>

        <PropertyCell label="Designer">
          <DesignerAssignmentSelector
            workItemType={isRevision ? "revision" : "original"}
            workItemId={currentWork.id!}
            currentDesigner={designer}
            revisionLabel={isRevision ? (currentWork.revisionLabel ?? revLabel) : null}
            designers={designers}
            patchUrl={patchUrl}
            unassignedLabel="Assign designer"
            onDesignerChanged={onChanged}
          />
        </PropertyCell>

        <PropertyCell label="Issued">
          <p className={cn(fieldMuted, "font-medium", issuedLabel === "Pending" && "text-t2")}>
            {issuedLabel}
          </p>
        </PropertyCell>

        <EditableTargetDue
          workItemId={currentWork.id!}
          patchUrl={patchUrl}
          requiredByDate={dueSource}
          completed={completed}
          onChanged={onChanged}
        />
      </PropertyGrid>
    </section>
  )
}

/** @deprecated Use CurrentRevisionSection */
export const CurrentDrawingSection = CurrentRevisionSection

export type ProjectDetailsData = {
  client: string
  /** When set, job is linked to a Managed Site. */
  siteId: string | null
  siteName: string | null
  siteAddress: string | null
  descriptionOfWorks: string | null
  requestedBy: string | null
  dateRequested: string | null
  designDue: string | null
  designer: string | null
  checker: string | null
  otherJobsAtSiteCount: number
  onViewSiteJobs?: () => void
}

export function ProjectDetailsSection({
  data,
  jobKey,
}: {
  data: ProjectDetailsData
  /** Resets expanded/collapsed when the open job changes. */
  jobKey?: string
}) {
  void jobKey
  const isManagedSite = Boolean(data.siteId)

  return (
    <section aria-label="Job Summary">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-t4">
        Job Summary
      </h3>
      <div className="space-y-4 rounded-[12px] border border-jobs-panel-card-bd bg-jobs-panel-card p-5">
        <Meta label="Client" value={data.client} />
        <Meta label="Site" value={data.siteName} />
        <Meta label="Address" value={data.siteAddress} />
        <Meta label="Description" value={data.descriptionOfWorks} />
        <Meta label="Requested By" value={data.requestedBy} />
        <Meta label="Requested Date" value={safeDateLabel(data.dateRequested) || null} />
        <Meta label="Design Due" value={safeDateLabel(data.designDue) || null} />
        {isManagedSite && data.otherJobsAtSiteCount > 0 && (
          <div>
            <p className={cn(fieldLabel, "mb-1 text-t4")}>Other Jobs At This Location</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-t1">
                {data.otherJobsAtSiteCount} Job{data.otherJobsAtSiteCount === 1 ? "" : "s"}
              </p>
              {data.onViewSiteJobs && (
                <button
                  type="button"
                  onClick={data.onViewSiteJobs}
                  className="text-xs font-medium text-t2 underline-offset-2 hover:underline"
                >
                  View Jobs
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export type QuoteCardItem = LinkedQuoteSummary & {
  scopeLabel?: string
}

export type Cat2Summary = {
  id: string
  label: string
  createdAt: string
  revisionLabel: string | null
}

export function CATIISummary({
  activeLabel,
  activeCheck,
  previousCheck,
  busy,
  canCreate,
  onCreate,
  onOpen,
}: {
  activeLabel: string
  activeCheck: Cat2Summary | null
  previousCheck: Cat2Summary | null
  busy: boolean
  canCreate: boolean
  onCreate: () => void
  onOpen: (id: string) => void
}) {
  const displayId = activeCheck
    ? `CATII · ${safeDateLabel(activeCheck.createdAt) || "On file"}`
    : null

  return (
    <section aria-label="Linked Records">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-t4">
        Linked Records
      </h3>
      {activeCheck ? (
        <div className="rounded-[12px] border border-jobs-panel-card-bd bg-jobs-panel-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-t1">{displayId}</p>
              <p className="mt-0.5 text-sm text-t3">
                {activeCheck.revisionLabel ?? activeLabel}
                {" · On file"}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-medium text-t2 underline-offset-2 hover:underline"
              onClick={() => onOpen(activeCheck.id)}
            >
              Open Check
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 rounded-[12px] border border-jobs-panel-card-bd bg-jobs-panel-card p-5">
          <div className="flex items-center justify-between gap-3">
            <p className={fieldMuted}>No CATII check for {activeLabel}</p>
            {canCreate && (
              <button
                type="button"
                className="text-xs font-medium text-t2 underline-offset-2 hover:underline disabled:opacity-50"
                onClick={onCreate}
                disabled={busy}
              >
                {busy ? "Creating…" : "Create CATII Check"}
              </button>
            )}
          </div>
          {previousCheck && (
            <p className="text-xs text-t3">
              Latest previous: {previousCheck.revisionLabel ?? "Original"} ·{" "}
              {safeDateLabel(previousCheck.createdAt)}
              {" · "}
              <button
                type="button"
                className="font-medium text-t2 underline-offset-2 hover:underline"
                onClick={() => onOpen(previousCheck.id)}
              >
                Open
              </button>
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export type HistoryRevision = {
  id: string
  letter: string | null
  title: string
  status: string
  createdAt: string
  designer: string
  reason: string | null
  billable: boolean
  fee: number | null
  quoteNumber: string | null
  hasCat2: boolean
  isCurrent: boolean
  requiredByDate?: string | null
}

function revisionTitle(rev: HistoryRevision, current = false): string {
  if (rev.letter) {
    return current ? `Revision ${rev.letter} (Current)` : `Revision ${rev.letter}`
  }
  return current ? "Original (Current)" : "Original"
}

/**
 * Revision History — spacing + typography hierarchy (no coloured container).
 * Current-work controls nest under the current revision as children.
 */
export function RevisionTimeline({
  revisions,
  jobKey,
  onSelectRevision,
  children,
}: {
  revisions: HistoryRevision[]
  /** Unused — kept for call-site compatibility when switching jobs. */
  jobKey?: string
  onSelectRevision?: (revision: HistoryRevision) => void
  children?: ReactNode
}) {
  void jobKey
  const current =
    revisions.find(r => r.isCurrent)
    ?? revisions[0]
    ?? null
  const priors = current
    ? revisions.filter(r => r.id !== current.id)
    : []

  return (
    <section aria-label="Revision History">
      <h3 className="mb-4 text-[11px] font-bold uppercase tracking-[0.08em] text-t4">
        Revision History
      </h3>

      {revisions.length === 0 || !current ? (
        <div className="space-y-5 rounded-[12px] border border-jobs-panel-card-bd bg-jobs-panel-card p-5">
          <p className={fieldMuted}>Original drawing only</p>
          {children}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-4 rounded-[12px] border border-jobs-panel-card-bd bg-jobs-panel-card p-5">
            <button
              type="button"
              className={cn(
                "w-full space-y-3 text-left",
                "outline-none focus-visible:ring-2 focus-visible:ring-ac rounded-md",
              )}
              onClick={() => onSelectRevision?.(current)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-t1">
                  {revisionTitle(current, true)}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide text-t4 tabular-nums">
                  {safeDateLabel(current.createdAt) || "—"}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-t4">
                  {current.letter ? "Reason for Revision" : "Description"}
                </p>
                <p className="text-sm leading-snug text-t2">
                  {current.reason?.trim()
                    || (current.letter
                      ? "No amendment instructions have been entered."
                      : "No description has been entered.")}
                </p>
              </div>
            </button>
            {children ? (
              <div className="border-t border-jobs-panel-divider pt-4">
                {children}
              </div>
            ) : null}
          </div>

          {priors.length > 0 ? (
            <div className="space-y-3 px-1">
              {priors.map((rev) => (
                <div key={rev.id}>
                  <div className="mb-3 h-px bg-jobs-panel-divider" aria-hidden />
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left opacity-70 transition-opacity duration-150 hover:opacity-100",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ac rounded-md",
                    )}
                    onClick={() => onSelectRevision?.(rev)}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-t2">
                        {revisionTitle(rev)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-t4 tabular-nums">
                        {safeDateLabel(rev.createdAt) || "—"}
                      </span>
                    </div>
                    <p className="text-xs text-t3">
                      {rev.reason?.trim()
                        || getDrawingStatusLabel(rev.status)
                        || "—"}
                    </p>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}