"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  Building2,
  ChevronDown,
  History,
  PencilRuler,
  ShieldCheck,
} from "lucide-react"
import { cn, getRevisionDueInfo, revisionDueToneClass } from "@/shared/utils/utils"
import { missingLabel } from "./jobs-register-helpers"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import {
  getDrawingStatusColour,
  getDrawingStatusLabel,
} from "@/modules/jobs/lib/drawing-status-colours"
import type { getCurrentWorkItem } from "@/modules/jobs/lib/current-work"
import type { LinkedQuoteSummary } from "@/lib/types"
import { ClientSiteCell } from "./client-site-cell"

export const sectionHeading =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-t3"
export const fieldLabel = "mb-1 text-[11px] font-medium text-t3"
export const fieldValue = "text-sm text-t1"
export const fieldMuted = "text-sm text-t3"

const sectionIconClass = "h-3.5 w-3.5 shrink-0 text-t3"

function SectionTitle({
  icon: Icon,
  children,
  trailing,
}: {
  icon: typeof PencilRuler
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h4 className={cn(sectionHeading, "mb-0 flex items-center gap-2")}>
        <Icon className={sectionIconClass} aria-hidden />
        {children}
      </h4>
      {trailing}
    </div>
  )
}

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
      <p className={fieldLabel}>{label}</p>
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
  emptyLabel,
  tone = "primary",
}: {
  prefix: string
  status?: string | null
  emptyLabel?: string
  /** Primary = revision/current work; secondary = parent/project context. */
  tone?: "primary" | "secondary"
}) {
  if (!status) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-t3",
          tone === "primary" ? "border border-bd bg-surface-low" : "border border-transparent bg-transparent text-t4",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-t4" aria-hidden />
        {prefix}: {emptyLabel ?? "—"}
      </span>
    )
  }
  const colour = getDrawingStatusColour(status)
  if (tone === "secondary") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-t3">
        <span className="h-1.5 w-1.5 rounded-full bg-t4" aria-hidden />
        {prefix}: {getDrawingStatusLabel(status)}
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-bd/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        colour.text,
        colour.tint,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colour.dot)} aria-hidden />
      {prefix}: {getDrawingStatusLabel(status)}
    </span>
  )
}

/** Compact one-line state strip under the drawing title. */
export function RevisionSummaryStrip({
  revision,
  stage,
  designer,
  duePrimary,
  dueSeverity,
}: {
  revision: string
  stage: string
  designer: string
  duePrimary: string
  dueSeverity: ReturnType<typeof getRevisionDueInfo>["severity"]
}) {
  const dueTone = revisionDueToneClass(dueSeverity)
  const hasDesigner = Boolean(designer.trim())
  const designerLabel = hasDesigner ? designer.trim() : "Unassigned"
  return (
    <p className="mt-2 truncate text-xs leading-snug text-t3">
      <span className="font-semibold uppercase tracking-wide text-t2">{revision}</span>
      <span className="mx-1.5 text-t4" aria-hidden>·</span>
      <span>{stage}</span>
      <span className="mx-1.5 text-t4" aria-hidden>·</span>
      <span className={hasDesigner ? "text-t2" : "text-t4"}>{designerLabel}</span>
      <span className="mx-1.5 text-t4" aria-hidden>·</span>
      <span className={cn("font-semibold", dueTone.text)}>{duePrimary}</span>
    </p>
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
    <div className="sticky top-0 z-20 shrink-0 border-b border-bd/70 bg-sr/95 px-5 pt-4 pb-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {leadingSlot}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={cn(
                  "font-bold tracking-tight text-t1",
                  dense
                    ? "text-lg leading-snug [overflow-wrap:anywhere]"
                    : "truncate text-[22px]",
                )}
              >
                {drawingNumber}
              </h3>
              {revisionBadge && (
                <span className="rounded-md border border-bd bg-surface-low px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-t2">
                  {revisionBadge}
                </span>
              )}
            </div>
            <ClientSiteCell
              className="mt-1.5"
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

      <div className="mt-3 flex flex-wrap items-center gap-2">{statusChips}</div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** Focal engineering section for the active original or revision. */
export function CurrentRevisionSection({
  currentWork,
  revLabel,
  designer,
  designers,
  lastCompleted,
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
  descriptionOfWorks: string | null
  revisionReason: string | null
  revisionDate: string | null
  requiredByDate?: string | null
  patchUrl?: string
  onChanged: () => void
}) {
  const active = currentWork.type !== "none" && Boolean(currentWork.id)
  const isRevision = currentWork.type === "revision"
  const drawingLabel =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : currentWork.type === "original"
        ? "Original"
        : "—"
  const briefLabel = isRevision ? "Amendment Reason" : "Description of Works"
  const briefText = isRevision ? revisionReason : descriptionOfWorks
  const briefEmpty = isRevision ? "No amendment reason recorded" : "No description recorded"
  const issuedLabel =
    currentWork.status === "ISSUED"
      ? (safeDateLabel(lastCompleted) || "Issued")
      : "Pending"
  const completed = currentWork.status === "ISSUED" || currentWork.type === "none"
  const due = getRevisionDueInfo(
    requiredByDate ?? currentWork.dueDate,
    { completed },
  )
  const dueTone = revisionDueToneClass(due.severity)

  return (
    <section className="pt-1">
      <SectionTitle icon={PencilRuler}>Current Revision</SectionTitle>

      {!active ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-t1">No active drawing work</p>
          <p className="text-sm text-t3">
            Last completed {safeDateLabel(lastCompleted) || "—"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className={fieldLabel}>Revision</p>
              <p className="text-sm font-semibold text-t1">{drawingLabel}</p>
            </div>
            <div>
              <p className={fieldLabel}>Status</p>
              <WorkItemStatusSelector
                workItemType={isRevision ? "revision" : "original"}
                workItemId={currentWork.id!}
                currentStatus={currentWork.status}
                revisionLabel={isRevision ? currentWork.revisionLabel : null}
                patchUrl={patchUrl}
                size="md"
                onStatusChanged={onChanged}
              />
            </div>
          </div>

          <div className="rounded-lg border border-bd/70 bg-surface-low/70 px-3.5 py-3.5">
            <p className={fieldLabel}>{briefLabel}</p>
            <p
              className={cn(
                "text-[15px] font-semibold leading-relaxed whitespace-pre-wrap",
                briefText?.trim() ? "text-t1" : "text-t3 font-medium",
              )}
            >
              {briefText?.trim() || briefEmpty}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DesignerAssignmentSelector
              workItemType={isRevision ? "revision" : "original"}
              workItemId={currentWork.id!}
              currentDesigner={designer}
              revisionLabel={isRevision ? currentWork.revisionLabel : null}
              designers={designers}
              patchUrl={patchUrl}
              labeled
              unassignedLabel="Unassigned"
              onDesignerChanged={onChanged}
            />
            <div>
              <p className={fieldLabel}>{isRevision ? "Revision Date" : "Date Created"}</p>
              <p className="text-sm font-semibold text-t1">
                {safeDateLabel(revisionDate) || "—"}
              </p>
            </div>

            <div className="sm:col-span-2 rounded-md border border-bd/50 bg-sr px-3 py-2.5">
              <p className={fieldLabel}>Days Remaining</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2.5 py-1 text-base font-bold",
                  dueTone.text,
                  dueTone.tint,
                )}
              >
                {due.severity === "none" ? "No Due Date" : due.daysLabel}
              </span>
              <p className="mt-2 text-[11px] font-medium text-t3">Target Due</p>
              <p className={cn("text-sm", due.severity === "none" ? "text-t3" : "text-t2")}>
                {due.severity === "none" ? "No Due Date" : due.dateLabel}
              </p>
            </div>

            <div>
              <p className={fieldLabel}>Issued</p>
              <p className="text-sm font-semibold text-t1">{issuedLabel}</p>
            </div>
          </div>
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
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
  }, [jobKey])

  return (
    <section className="border-t border-bd/60 pt-4">
      <button
        type="button"
        className="mb-0 flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        <h4 className={cn(sectionHeading, "mb-0 flex items-center gap-2")}>
          <Building2 className={sectionIconClass} aria-hidden />
          Project Details
        </h4>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-t3 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 pt-3">
            <Meta label="Client" value={data.client} />
            <Meta label="Site" value={data.siteName} />
            <Meta label="Address" value={data.siteAddress} />
            <Meta label="Description" value={data.descriptionOfWorks} />
            <Meta label="Requested By" value={data.requestedBy} />
            <Meta label="Requested Date" value={safeDateLabel(data.dateRequested) || null} />
            {isManagedSite && data.otherJobsAtSiteCount > 0 && (
              <div>
                <p className={fieldLabel}>Other Jobs At This Location</p>
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
          </div>
        </div>
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
    <section className="border-t border-bd/60 pt-4">
      <SectionTitle icon={ShieldCheck}>CATII Check</SectionTitle>
      {activeCheck ? (
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
  const [expanded, setExpanded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setExpanded(false)
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
    <section className="border-t border-bd/60 pt-4 pb-2">
      <button
        type="button"
        className="mb-0 flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        <h4 className={cn(sectionHeading, "mb-0 flex items-center gap-2")}>
          <History className={sectionIconClass} aria-hidden />
          Revision History ({count})
        </h4>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-t3 transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3">
            {revisions.length === 0 ? (
              <p className={fieldMuted}>Original drawing only</p>
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
                    <li key={rev.id} className="border-b border-bd/40 last:border-b-0">
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors",
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
                          <div className="space-y-1.5 pb-3 pl-0.5 text-xs text-t3">
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
          </div>
        </div>
      </div>
    </section>
  )
}