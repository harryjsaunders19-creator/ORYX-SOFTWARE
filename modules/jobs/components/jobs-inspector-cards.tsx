"use client"

import { useState, type ReactNode } from "react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { missingLabel } from "./jobs-register-helpers"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { designerInitials } from "./designer-assignment-selector"
import {
  getDrawingStatusBadgeClass,
  getDrawingStatusColour,
  getDrawingStatusLabel,
  OVERDUE_STATUS_COLOUR,
} from "@/modules/jobs/lib/drawing-status-colours"
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge"
import type { getCurrentWorkItem } from "@/modules/jobs/lib/current-work"
import type { LinkedQuoteSummary } from "@/lib/types"

export const sectionHeading =
  "mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-t3"
export const fieldLabel = "mb-1 text-[11px] font-medium text-t3"
export const fieldValue = "text-sm text-t1"
export const fieldMuted = "text-sm text-t3"

export function safeDateLabel(value: string | null | undefined): string {
  if (!value) return ""
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

export function relativeActivity(value: string | null | undefined): string {
  if (!value) return "—"
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return "—"
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000))
  if (days === 0) return "Today"
  if (days === 1) return "1 day ago"
  if (days < 14) return `${days} days ago`
  return safeDateLabel(value) || "—"
}

function Meta({
  label,
  value,
  fullWidth,
  important,
}: {
  label: string
  value: string | null | undefined
  fullWidth?: boolean
  important?: boolean
}) {
  const trimmed = typeof value === "string" ? value.trim() : value
  if (!trimmed && !important) return null
  return (
    <div className={cn(fullWidth && "sm:col-span-2")}>
      <p className={fieldLabel}>{label}</p>
      <p className={cn(trimmed ? fieldValue : fieldMuted, "whitespace-pre-wrap")}>
        {trimmed || "Not recorded"}
      </p>
    </div>
  )
}

function ExpandableText({ text, empty }: { text: string | null; empty: string }) {
  const [open, setOpen] = useState(false)
  const value = text?.trim()
  if (!value) return <p className={fieldMuted}>{empty}</p>
  const long = value.length > 220 || value.split("\n").length > 4
  return (
    <div>
      <p className={cn(fieldValue, "whitespace-pre-wrap", !open && long && "line-clamp-4")}>
        {value}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-ac2 hover:underline"
          onClick={() => setOpen(v => !v)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

/** Compact semantic status chip for the inspector header. */
export function StatusChip({
  prefix,
  status,
  emptyLabel,
}: {
  prefix: string
  status?: string | null
  emptyLabel?: string
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-bd bg-surface-low px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-t3">
        <span className="h-1.5 w-1.5 rounded-full bg-t4" aria-hidden />
        {prefix}: {emptyLabel ?? "None"}
      </span>
    )
  }
  const colour = getDrawingStatusColour(status)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-bd/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
        colour.text,
        colour.tint,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colour.dot)} aria-hidden />
      {prefix}: {getDrawingStatusLabel(status)}
    </span>
  )
}

export function InspectorHeader({
  drawingNumber,
  revisionBadge,
  client,
  site,
  statusChips,
  moreSlot,
  children,
}: {
  drawingNumber: string
  revisionBadge: string | null
  client: string
  site: string
  statusChips: ReactNode
  moreSlot?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-bd/70 bg-sr/95 px-5 pt-4 pb-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[22px] font-bold tracking-tight text-t1">
              {drawingNumber}
            </h3>
            {revisionBadge && (
              <span className="rounded-md border border-bd bg-surface-low px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-t2">
                {revisionBadge}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-t1">{client || "—"}</p>
          <p className="mt-0.5 truncate text-sm text-t3">{site || "—"}</p>
        </div>
        {moreSlot}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">{statusChips}</div>

      <div className="mt-3.5">{children}</div>
    </div>
  )
}

export function CurrentFocusSection({
  currentWork,
  revLabel,
  designer,
  designers,
  dueDate,
  nextAction,
  lastCompleted,
  patchUrl,
  onChanged,
}: {
  currentWork: ReturnType<typeof getCurrentWorkItem>
  revLabel: string
  designer: string
  designers: string[]
  dueDate: string | null
  nextAction: string
  lastCompleted: string | null
  patchUrl?: string
  onChanged: () => void
}) {
  const active = currentWork.type !== "none" && Boolean(currentWork.id)
  const stage =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : currentWork.type === "original"
        ? "Original design"
        : "No active drawing work"
  const due = dueLabel(dueDate)
  const overdue = due.startsWith("Overdue")
  const isUrgent = overdue || due.startsWith("Today") || due.startsWith("Tomorrow")

  return (
    <section className="relative overflow-hidden rounded-lg border border-rs-bd/40 bg-rs-bg/40 pl-4 pr-4 py-3.5 dark:bg-rs-bg/20">
      <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-rs-ic" aria-hidden />
      <h4 className={cn(sectionHeading, "mb-3 text-rs-tx")}>Current Focus</h4>

      {!active ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className={fieldLabel}>Status</p>
            <p className={fieldValue}>No active drawing work</p>
          </div>
          <div>
            <p className={fieldLabel}>Last completed</p>
            <p className={fieldMuted}>{safeDateLabel(lastCompleted) || "Not recorded"}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className={fieldLabel}>Active stage</p>
              <p className="text-sm font-semibold text-t1">{stage}</p>
            </div>
            <div>
              <p className={fieldLabel}>Current task</p>
              <p className="text-sm font-semibold text-t1">{nextAction}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bd/50 pt-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-rs-ic/15 text-[11px] font-bold text-rs-tx">
                {designerInitials(designer || "?")}
              </div>
              <div className="min-w-0">
                <p className={fieldLabel}>Responsible</p>
                <DesignerAssignmentSelector
                  workItemType={currentWork.type === "revision" ? "revision" : "original"}
                  workItemId={currentWork.id!}
                  currentDesigner={designer}
                  revisionLabel={currentWork.type === "revision" ? currentWork.revisionLabel : null}
                  designers={designers}
                  patchUrl={patchUrl}
                  compact
                  onDesignerChanged={onChanged}
                />
              </div>
            </div>
            <div className="text-right">
              <p className={fieldLabel}>Due</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                  isUrgent || overdue
                    ? cn(OVERDUE_STATUS_COLOUR.tint, OVERDUE_STATUS_COLOUR.text)
                    : "bg-surface-low text-t2",
                )}
              >
                {due}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-bd/50 pt-3 sm:grid-cols-2">
            <div>
              <p className={fieldLabel}>Drawing status</p>
              <div className="mt-0.5">
                <WorkItemStatusSelector
                  workItemType={currentWork.type === "revision" ? "revision" : "original"}
                  workItemId={currentWork.id!}
                  currentStatus={currentWork.status}
                  revisionLabel={currentWork.type === "revision" ? currentWork.revisionLabel : null}
                  patchUrl={patchUrl}
                  size="md"
                  onStatusChanged={onChanged}
                />
              </div>
            </div>
            <div>
              <p className={fieldLabel}>Checker</p>
              <p className={fieldMuted}>Not assigned</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export type ProjectDetailsData = {
  client: string
  siteName: string | null
  siteAddress: string | null
  typeOfWorks: string | null
  description: string | null
  requestedBy: string | null
  dateRequested: string | null
}

export function ProjectDetailsSection({ data }: { data: ProjectDetailsData }) {
  return (
    <section className="border-t border-bd/60 pt-5">
      <h4 className={sectionHeading}>Project Details</h4>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Meta label="Client" value={data.client} important />
        <Meta label="Site" value={data.siteName} important />
        <Meta label="Site address" value={data.siteAddress} fullWidth important />
        <Meta label="Type of works" value={data.typeOfWorks} />
        <Meta label="Requested by" value={data.requestedBy} />
        <Meta label="Date requested" value={safeDateLabel(data.dateRequested) || null} />
      </div>
      <div className="mt-4 border-t border-bd/50 pt-3.5">
        <p className={fieldLabel}>Description of works</p>
        <ExpandableText text={data.description} empty="No description recorded" />
      </div>
    </section>
  )
}

export type RevisionDetailsData = {
  label: string
  reason: string | null
  requestedBy: string | null
  requestedDate: string | null
  billable: boolean
  fee: number | null
  quoteNumber: string | null
}

export function RevisionDetailsSection({ data }: { data: RevisionDetailsData }) {
  const feeLabel =
    !data.billable ? "Free revision"
      : data.fee == null ? "Not set"
        : formatGBP(data.fee)

  return (
    <section className="relative border-t border-bd/60 pt-5 pl-3">
      <span className="absolute bottom-0 left-0 top-5 w-[2px] rounded-full bg-ac2/70" aria-hidden />
      <h4 className={sectionHeading}>Revision Details</h4>
      <div className="mb-4">
        <p className={fieldLabel}>Reason for revision</p>
        <ExpandableText text={data.reason} empty="No reason recorded" />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <Meta label="Revision" value={data.label} important />
        <Meta label="Chargeable" value={data.billable ? "Yes" : "No"} important />
        <Meta label="Requested by" value={data.requestedBy} />
        <Meta label="Date requested" value={safeDateLabel(data.requestedDate) || null} />
        <Meta label="Revision fee" value={feeLabel} important />
        <Meta label="Quotation" value={data.quoteNumber} />
      </div>
    </section>
  )
}

export type CommercialData = {
  totalValue: number | null
  outstanding: number | null
  originalFee: number | null
  revisionRevenue: number | null
  revisionCount: number
  lastActivity: string | null
}

export function CommercialSummary({ data }: { data: CommercialData }) {
  const money = (v: number | null) =>
    v == null ? <span className={fieldMuted}>Not set</span> : formatGBP(v)

  return (
    <section className="border-t border-bd/60 pt-5">
      <h4 className={sectionHeading}>Commercial</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={fieldLabel}>Total project value</p>
          <p className="text-lg font-semibold tabular-nums text-t1">{money(data.totalValue)}</p>
        </div>
        <div>
          <p className={fieldLabel}>Outstanding</p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              (data.outstanding ?? 0) > 0 ? "text-dn" : "text-t1",
            )}
          >
            {money(data.outstanding)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-bd/50 pt-3.5 sm:grid-cols-4">
        <div>
          <p className={fieldLabel}>Orig. fee</p>
          <p className="text-sm font-semibold tabular-nums text-t1">{money(data.originalFee)}</p>
        </div>
        <div>
          <p className={fieldLabel}>Rev revenue</p>
          <p className="text-sm font-semibold tabular-nums text-t1">{money(data.revisionRevenue)}</p>
        </div>
        <div>
          <p className={fieldLabel}>Rev count</p>
          <p className="text-sm font-semibold text-t1">{data.revisionCount}</p>
        </div>
        <div>
          <p className={fieldLabel}>Last activity</p>
          <p className="text-sm font-semibold text-t1">{relativeActivity(data.lastActivity)}</p>
        </div>
      </div>
    </section>
  )
}

export type QuoteCardItem = LinkedQuoteSummary & {
  scopeLabel?: string
}

export function QuotationSummary({
  originalQuote,
  revisionQuote,
  unlinkBusy,
  onOpen,
  onAttach,
  onChange,
  onUnlink,
}: {
  originalQuote: QuoteCardItem | null
  revisionQuote: QuoteCardItem | null
  unlinkBusy: boolean
  onOpen: (quote: QuoteCardItem) => void
  onAttach: () => void
  onChange: () => void
  onUnlink: (quote: QuoteCardItem) => void
}) {
  const hasAny = Boolean(originalQuote || revisionQuote)
  return (
    <section className="border-t border-bd/60 pt-5">
      <h4 className={sectionHeading}>Quotation</h4>
      {!hasAny ? (
        <div className="flex items-center justify-between gap-3">
          <p className={fieldMuted}>No quotation attached</p>
          <button type="button" className="text-xs font-medium text-ac2 hover:underline" onClick={onAttach}>
            Attach Quote
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {originalQuote && (
            <QuoteRow
              title={revisionQuote ? "Original quote" : undefined}
              quote={originalQuote}
              unlinkBusy={unlinkBusy}
              onOpen={() => onOpen(originalQuote)}
              onChange={onChange}
              onUnlink={() => onUnlink(originalQuote)}
            />
          )}
          {revisionQuote && (
            <QuoteRow
              title="Revision quote"
              quote={revisionQuote}
              unlinkBusy={unlinkBusy}
              onOpen={() => onOpen(revisionQuote)}
              onChange={onChange}
              onUnlink={() => onUnlink(revisionQuote)}
            />
          )}
        </div>
      )}
    </section>
  )
}

function QuoteRow({
  title,
  quote,
  unlinkBusy,
  onOpen,
  onChange,
  onUnlink,
}: {
  title?: string
  quote: QuoteCardItem
  unlinkBusy: boolean
  onOpen: () => void
  onChange: () => void
  onUnlink: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {title && <p className="mb-0.5 text-[11px] font-medium text-t3">{title}</p>}
        <p className="truncate text-sm font-semibold text-t1">
          {quote.quoteNumber}
          {quote.scopeLabel ? (
            <span className="ml-1.5 text-xs font-normal text-t3">· {quote.scopeLabel}</span>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-t2">
          <QuoteStatusBadge status={quote.status} />
          <span className="text-t4">·</span>
          <span className="tabular-nums font-medium">{formatGBP(quote.quoteValue)}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <button type="button" className="text-xs font-medium text-ac2 hover:underline" onClick={onOpen}>
          Open Quote
        </button>
        <button type="button" className="text-xs font-medium text-t3 hover:underline" onClick={onChange}>
          Change
        </button>
        <button
          type="button"
          className="text-xs font-medium text-t4 hover:underline disabled:opacity-50"
          onClick={onUnlink}
          disabled={unlinkBusy}
        >
          Unlink
        </button>
      </div>
    </div>
  )
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
  return (
    <section className="border-t border-bd/60 pt-5">
      <h4 className={sectionHeading}>CATII Check</h4>
      {activeCheck ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-t1">{activeCheck.label}</p>
            <p className="mt-0.5 text-sm text-t3">
              {activeCheck.revisionLabel ?? activeLabel}
              {" · "}
              Created {safeDateLabel(activeCheck.createdAt)}
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
}

export function RevisionTimeline({ revisions }: { revisions: HistoryRevision[] }) {
  const revOnly = revisions.filter(r => r.letter)
  const count = revOnly.length || revisions.length

  return (
    <section className="border-t border-bd/60 pt-5 pb-2">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h4 className={cn(sectionHeading, "mb-0")}>Revision Timeline</h4>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-t4">
          {count} registered
        </span>
      </div>

      {revisions.length === 0 ? (
        <p className={fieldMuted}>Original design only</p>
      ) : (
        <ol className="relative space-y-0 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-bd">
          {revisions.map(rev => {
            const title = rev.letter ? `Revision ${rev.letter}` : "Original"
            const marker = rev.letter?.trim().slice(0, 1).toUpperCase() || "O"
            const fee = !rev.billable
              ? "Free"
              : rev.fee == null
                ? null
                : formatGBP(rev.fee)
            const colour = getDrawingStatusColour(rev.status)

            return (
              <li key={rev.id} className="relative pb-5 pl-9 last:pb-0">
                <span
                  className={cn(
                    "absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-sr text-[10px] font-bold",
                    rev.isCurrent
                      ? "bg-rs-ic text-white"
                      : "bg-surface-low text-t3 ring-1 ring-bd",
                  )}
                  aria-hidden
                >
                  {marker}
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn("text-sm font-semibold", rev.isCurrent ? "text-t1" : "text-t2")}>
                        {title}
                      </p>
                      {rev.isCurrent && (
                        <span className="rounded bg-rs-ic px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                          Active
                        </span>
                      )}
                      {!rev.isCurrent && rev.status === "ISSUED" && (
                        <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", getDrawingStatusBadgeClass("ISSUED"))}>
                          Complete
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-t3">
                      {safeDateLabel(rev.createdAt)}
                      {" · "}
                      {missingLabel(rev.designer, "Unassigned")}
                    </p>
                    {rev.reason?.trim() && (
                      <p className={cn("mt-1.5 text-sm leading-snug", rev.isCurrent ? "text-t2" : "text-t3")}>
                        {rev.reason.trim()}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-t4">
                      <span className={colour.text}>{getDrawingStatusLabel(rev.status)}</span>
                      {rev.quoteNumber ? ` · Quote ${rev.quoteNumber}` : ""}
                      {" · "}
                      {rev.hasCat2 ? "CATII on file" : "No CATII"}
                    </p>
                  </div>
                  {fee != null && (
                    <p className={cn("shrink-0 text-sm font-semibold tabular-nums", rev.isCurrent ? "text-t1" : "text-t3")}>
                      {fee}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
