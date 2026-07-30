"use client"

import { useState, type ReactNode } from "react"
import {
  Building2,
  Calculator,
  FileText,
  History,
  PencilRuler,
  ShieldCheck,
} from "lucide-react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { missingLabel } from "./jobs-register-helpers"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import {
  getDrawingStatusBadgeClass,
  getDrawingStatusColour,
  getDrawingStatusLabel,
  OVERDUE_STATUS_COLOUR,
} from "@/modules/jobs/lib/drawing-status-colours"
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge"
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
      <p className={cn(fieldValue, "whitespace-pre-wrap leading-relaxed", !open && long && "line-clamp-4")}>
        {value}
      </p>
      {long && (
        <button
          type="button"
          className="mt-1.5 text-xs font-medium text-ac2 hover:underline"
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
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {collapseSlot}
          {moreSlot}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">{statusChips}</div>
      <div className="mt-3.5">{children}</div>
    </div>
  )
}

/** Consolidated operational section for the active original or revision. */
export function CurrentDrawingSection({
  currentWork,
  revLabel,
  designer,
  designers,
  dueDate,
  nextAction,
  lastCompleted,
  descriptionOfWorks,
  revisionReason,
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
  descriptionOfWorks: string | null
  revisionReason: string | null
  patchUrl?: string
  onChanged: () => void
}) {
  const active = currentWork.type !== "none" && Boolean(currentWork.id)
  const drawingLabel =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : currentWork.type === "original"
        ? "Original"
        : "No active drawing"
  const due = dueLabel(dueDate)
  const overdue = due.startsWith("Overdue")
  const isUrgent = overdue || due.startsWith("Today") || due.startsWith("Tomorrow")
  const isRevision = currentWork.type === "revision"
  const briefLabel = isRevision ? "Reason for Revision" : "Description of Works"
  const briefText = isRevision ? revisionReason : descriptionOfWorks
  const briefEmpty = isRevision ? "No reason recorded" : "No description recorded"

  return (
    <section className="border-t border-bd/60 pt-5">
      <SectionTitle icon={PencilRuler}>Current Drawing</SectionTitle>

      {!active ? (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-t1">No active drawing work</p>
            <p className="mt-1 text-sm text-t3">
              Last completed {safeDateLabel(lastCompleted) || "Not recorded"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-t1">{drawingLabel}</p>
              <div className="mt-1.5">
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
          </div>

          <div className="relative rounded-md border-l-[3px] border-l-ac2/80 bg-surface-low/60 py-3 pl-3.5 pr-3">
            <p className={fieldLabel}>{briefLabel}</p>
            <ExpandableText text={briefText} empty={briefEmpty} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className={fieldLabel}>Design Engineer</p>
              <DesignerAssignmentSelector
                workItemType={isRevision ? "revision" : "original"}
                workItemId={currentWork.id!}
                currentDesigner={designer}
                revisionLabel={isRevision ? currentWork.revisionLabel : null}
                designers={designers}
                patchUrl={patchUrl}
                compact
                onDesignerChanged={onChanged}
              />
            </div>
            <div>
              <p className={fieldLabel}>Checking Engineer</p>
              <p className={fieldMuted}>Not assigned</p>
            </div>
            <div>
              <p className={fieldLabel}>Design Due</p>
              <span
                className={cn(
                  "inline-flex items-center rounded-md px-2 py-0.5 text-sm font-semibold",
                  isUrgent || overdue
                    ? cn(OVERDUE_STATUS_COLOUR.tint, OVERDUE_STATUS_COLOUR.text)
                    : "text-t1",
                )}
              >
                {due}
              </span>
            </div>
            <div>
              <p className={fieldLabel}>Next Action</p>
              <p className="text-sm font-semibold text-t1">{nextAction}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export type ProjectDetailsData = {
  client: string
  /** When set, job is linked to a Managed Site. */
  siteId: string | null
  siteName: string | null
  siteAddress: string | null
  typeOfWorks: string | null
  requestedBy: string | null
  dateRequested: string | null
  otherJobsAtSiteCount: number
  onViewSiteJobs?: () => void
}

export function ProjectDetailsSection({ data }: { data: ProjectDetailsData }) {
  const isManagedSite = Boolean(data.siteId)
  return (
    <section className="border-t border-bd/60 pt-5">
      <SectionTitle icon={Building2}>Project Details</SectionTitle>
      <div className="space-y-3.5">
        <Meta label="Client" value={data.client} important />
        <Meta
          label="Location"
          value={data.siteName}
          important
        />
        <Meta label="Address" value={data.siteAddress} important />
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
        <Meta label="Type of Works" value={data.typeOfWorks} />
        <Meta label="Requested By" value={data.requestedBy} />
        <Meta label="Date Requested" value={safeDateLabel(data.dateRequested) || null} />
      </div>
    </section>
  )
}

export type CommercialData = {
  originalFee: number | null
  /** Active revision fee only (null = unknown billable). */
  activeRevisionFee: number | null
  activeRevisionBillable: boolean | null
  hasActiveRevision: boolean
  knownProjectValue: number | null
  quoteNumber: string | null
  quoteStatus: string | null
  feeStatus: "Agreed" | "Pending" | "Free revision" | "Partial"
}

export function CommercialSummary({ data }: { data: CommercialData }) {
  const originalDisplay =
    data.originalFee == null
      ? <span className={fieldMuted}>Fee not set</span>
      : <span className="tabular-nums">{formatGBP(data.originalFee)}</span>

  let revisionDisplay: ReactNode = <span className={fieldMuted}>—</span>
  if (data.hasActiveRevision) {
    if (data.activeRevisionBillable === false) {
      revisionDisplay = <span className="text-t2">Free revision</span>
    } else if (data.activeRevisionFee == null) {
      revisionDisplay = (
        <span className="inline-flex items-center gap-1.5 font-semibold text-wn-tx">
          <span className="h-1.5 w-1.5 rounded-full bg-wn-ic" aria-hidden />
          Fee not set
        </span>
      )
    } else {
      revisionDisplay = <span className="tabular-nums">{formatGBP(data.activeRevisionFee)}</span>
    }
  }

  const quoteLine = data.quoteNumber
    ? `Attached · ${data.quoteNumber}`
    : "None attached"

  return (
    <section className="border-t border-bd/60 pt-5">
      <SectionTitle icon={Calculator}>Commercial</SectionTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className={fieldLabel}>Original Fee</p>
          <p className="text-base font-semibold text-t1">{originalDisplay}</p>
        </div>
        <div>
          <p className={fieldLabel}>Revision Fee</p>
          <p className="text-base font-semibold text-t1">{revisionDisplay}</p>
        </div>
        <div>
          <p className={fieldLabel}>Known Project Value</p>
          <p className="text-base font-semibold tabular-nums text-t1">
            {data.knownProjectValue == null
              ? <span className={fieldMuted}>Not available</span>
              : formatGBP(data.knownProjectValue)}
          </p>
        </div>
        <div>
          <p className={fieldLabel}>Quote</p>
          <p className="text-sm font-semibold text-t1">
            {quoteLine}
            {data.quoteStatus ? (
              <span className="mt-1 block text-xs font-normal text-t3">{data.quoteStatus}</span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <p className={fieldLabel}>Fee Status</p>
        <p
          className={cn(
            "text-sm font-semibold",
            data.feeStatus === "Pending" ? "text-wn-tx" : "text-t1",
          )}
        >
          {data.feeStatus}
        </p>
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
      <SectionTitle icon={FileText}>Quotation</SectionTitle>
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
        <p className="truncate text-sm font-semibold text-t1">{quote.quoteNumber}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-t2">
          <QuoteStatusBadge status={quote.status} />
          <span className="text-t4">·</span>
          <span className="font-medium tabular-nums">{formatGBP(quote.quoteValue)}</span>
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
  const displayId = activeCheck
    ? `CATII · ${safeDateLabel(activeCheck.createdAt) || "On file"}`
    : null

  return (
    <section className="border-t border-bd/60 pt-5">
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
}

export function RevisionTimeline({ revisions }: { revisions: HistoryRevision[] }) {
  const revOnly = revisions.filter(r => r.letter)
  const count = revOnly.length || revisions.length

  return (
    <section className="border-t border-bd/60 pt-5 pb-2">
      <SectionTitle
        icon={History}
        trailing={
          <span className="text-[10px] font-semibold uppercase tracking-wide text-t4">
            {count} registered
          </span>
        }
      >
        Revision History
      </SectionTitle>

      {revisions.length === 0 ? (
        <p className={fieldMuted}>Original drawing only</p>
      ) : (
        <ol className="relative space-y-0 before:absolute before:bottom-3 before:left-[11px] before:top-3 before:w-px before:bg-bd">
          {revisions.map(rev => {
            const title = rev.letter ? `Rev ${rev.letter}` : "Original"
            const marker = rev.letter?.trim().slice(0, 1).toUpperCase() || "O"
            const fee = !rev.billable
              ? "Free"
              : rev.fee == null
                ? null
                : formatGBP(rev.fee)
            const colour = getDrawingStatusColour(rev.status)
            const chargeLine = !rev.billable
              ? "Free revision"
              : rev.fee == null
                ? "Chargeable · Fee not set"
                : `Chargeable · ${formatGBP(rev.fee)}`

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
                      <span className={colour.text}>{getDrawingStatusLabel(rev.status)}</span>
                      {" · "}
                      {missingLabel(rev.designer, "Unassigned")}
                      {" · "}
                      {safeDateLabel(rev.createdAt)}
                    </p>
                    {rev.reason?.trim() && (
                      <p className={cn("mt-1.5 text-sm leading-snug", rev.isCurrent ? "text-t2" : "text-t3")}>
                        {rev.reason.trim()}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-t4">{chargeLine}</p>
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