"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  Building2,
  History,
  Pencil,
  ShieldCheck,
} from "lucide-react"
import { cn, getRevisionDueInfo, revisionDueToneClass } from "@/shared/utils/utils"
import {
  AccordionSection,
  EmptyStateCard,
  InfoCard,
  infoCardClassName,
  PropertyCell,
  PropertyGrid,
  RevisionCard,
  inspectorType,
} from "@/shared/layouts/inspector"
import { missingLabel } from "./jobs-register-helpers"
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
      <p className={cn(fieldLabel, "mb-1")}>{label}</p>
      <p className={cn(trimmed ? fieldValue : fieldMuted, "whitespace-pre-wrap")}>
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

/** Focal engineering section for the active original or revision. */
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
  const briefLabel = isRevision ? "Amendment Required" : "Engineer Instructions"
  const briefText = isRevision ? revisionReason : descriptionOfWorks
  const briefEmpty = isRevision
    ? "No amendment instructions have been entered."
    : "No description has been entered."
  const revisionDisplay = isRevision
    ? (currentWork.revisionLabel ?? revLabel)
    : "Original"
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

  return (
    <section className="pt-2">
      {!active ? (
        <EmptyStateCard
          eyebrow="Current Revision"
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
      ) : (
        <div className="space-y-5">
          <RevisionCard
            revisionLabel={revisionDisplay}
            instructionTitle={briefLabel}
            instructions={briefText}
            emptyInstructions={briefEmpty}
          />

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
        </div>
      )}
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
  const isManagedSite = Boolean(data.siteId)

  return (
    <AccordionSection icon={Building2} title="Project Details" defaultOpen resetKey={jobKey}>
      <InfoCard className="!p-3.5 space-y-3">
        <Meta label="Client" value={data.client} />
        <Meta label="Site" value={data.siteName} />
        <Meta label="Address" value={data.siteAddress} />
        <Meta label="Description" value={data.descriptionOfWorks} />
        <Meta label="Requested By" value={data.requestedBy} />
        <Meta label="Requested Date" value={safeDateLabel(data.dateRequested) || null} />
        {isManagedSite && data.otherJobsAtSiteCount > 0 && (
          <div>
            <p className={cn(fieldLabel, "mb-1")}>Other Jobs At This Location</p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-t1">
                {data.otherJobsAtSiteCount} Job{data.otherJobsAtSiteCount === 1 ? "" : "s"}
              </p>
              {data.onViewSiteJobs && (
                <button
                  type="button"
                  onClick={data.onViewSiteJobs}
                  className="text-xs font-medium text-ac hover:text-ach"
                >
                  View Jobs
                </button>
              )}
            </div>
          </div>
        )}
      </InfoCard>
    </AccordionSection>
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
    <AccordionSection icon={ShieldCheck} title="CATII Check" defaultOpen={false}>
      {activeCheck ? (
        <InfoCard className="!p-3.5">
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
              className="shrink-0 text-xs font-medium text-ac2 hover:underline"
              onClick={() => onOpen(activeCheck.id)}
            >
              Open Check
            </button>
          </div>
        </InfoCard>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className={fieldMuted}>No CATII check for {activeLabel}</p>
            {canCreate && (
              <button
                type="button"
                className="text-xs font-medium text-ac2 hover:underline disabled:opacity-50"
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
                className="font-medium text-ac2 hover:underline"
                onClick={() => onOpen(previousCheck.id)}
              >
                Open
              </button>
            </p>
          )}
        </div>
      )}
    </AccordionSection>
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

export function RevisionTimeline({
  revisions,
  jobKey,
  onSelectRevision,
}: {
  revisions: HistoryRevision[]
  /** Resets expanded/collapsed + selection when the open job changes. */
  jobKey?: string
  onSelectRevision?: (revision: HistoryRevision) => void
}) {
  const revOnly = revisions.filter(r => r.letter)
  const count = revOnly.length || revisions.length
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedId(null)
  }, [jobKey])

  const statusCaption = (rev: HistoryRevision) => {
    if (rev.isCurrent) return "Current"
    if (rev.status === "ISSUED") return "Completed"
    if (!rev.isCurrent && rev.status !== "ISSUED") {
      const newer = revisions.some(r =>
        r.letter
        && rev.letter
        && r.letter > rev.letter
        && (r.isCurrent || r.status === "ISSUED"),
      )
      if (newer) return "Superseded"
    }
    return getDrawingStatusLabel(rev.status)
  }

  return (
    <AccordionSection
      icon={History}
      title={`Revision History (${count})`}
      defaultOpen={false}
      resetKey={jobKey}
      className="pb-2"
    >
          <InfoCard className="!p-0 overflow-hidden">
            {revisions.length === 0 ? (
              <p className={cn(fieldMuted, "px-3.5 py-3")}>Original drawing only</p>
            ) : (
              <ol className="space-y-0">
                {revisions.map(rev => {
                  const title = rev.letter ? `REV ${rev.letter}` : "Original"
                  const colour = getDrawingStatusColour(rev.status)
                  const selected = selectedId === rev.id
                  const due = getRevisionDueInfo(rev.requiredByDate ?? null, {
                    completed: rev.status === "ISSUED",
                  })

                  return (
                    <li key={rev.id} className="border-b border-inspector-divider last:border-b-0">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors",
                          selected ? "bg-surface-low/80" : "hover:bg-surface-low/50",
                        )}
                        onClick={() => {
                          setSelectedId(prev => (prev === rev.id ? null : rev.id))
                          onSelectRevision?.(rev)
                        }}
                      >
                        <span className={cn("text-sm font-semibold", rev.isCurrent ? "text-t1" : "text-t2")}>
                          {title}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            rev.isCurrent ? "text-rs-tx" : colour.text,
                          )}
                        >
                          {statusCaption(rev)}
                        </span>
                      </button>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-200 ease-out",
                          selected ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="space-y-1.5 border-t border-inspector-divider/70 px-3.5 pb-3 pt-2 text-xs text-t3">
                            <p>
                              <span className={colour.text}>{getDrawingStatusLabel(rev.status)}</span>
                              {" · "}
                              {missingLabel(rev.designer, "Unassigned")}
                              {" · "}
                              {safeDateLabel(rev.createdAt) || "—"}
                            </p>
                            {rev.requiredByDate ? (
                              <p className={revisionDueToneClass(due.severity).text}>
                                Target due {due.dateLabel}
                                {due.severity !== "complete" && due.severity !== "none"
                                  ? ` · ${due.daysLabel}`
                                  : ""}
                              </p>
                            ) : null}
                            {rev.reason?.trim() ? (
                              <p className="text-sm leading-snug text-t2">{rev.reason.trim()}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </InfoCard>
    </AccordionSection>
  )
}