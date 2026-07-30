"use client"

import { useState } from "react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { missingLabel } from "./jobs-register-helpers"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { DrawingStatusBadge, DrawingStatusCompleteLabel } from "./drawing-status-badge"
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge"
import type { getCurrentWorkItem } from "@/modules/jobs/lib/current-work"
import type { LinkedQuoteSummary } from "@/lib/types"

export const inspectorCard = "rounded-lg border border-bd bg-sr p-3.5"
export const inspectorHeading = "mb-2.5 text-xs font-semibold uppercase tracking-wider text-t3"
export const inspectorLabel = "mb-1 text-xs text-t3"
export const inspectorValue = "text-sm text-t1"
export const inspectorMuted = "text-sm text-t3"

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
  if (diff <= 7) return `This week · ${absolute}`
  return absolute
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
  /** When true, show a clear empty state instead of omitting the row. */
  important?: boolean
}) {
  const trimmed = typeof value === "string" ? value.trim() : value
  if (!trimmed && !important) return null
  return (
    <div className={cn(fullWidth && "col-span-2")}>
      <p className={inspectorLabel}>{label}</p>
      <p className={cn(trimmed ? inspectorValue : inspectorMuted, "whitespace-pre-wrap")}>
        {trimmed || "Not recorded"}
      </p>
    </div>
  )
}

function ExpandableText({ text, empty }: { text: string | null; empty: string }) {
  const [open, setOpen] = useState(false)
  const value = text?.trim()
  if (!value) return <p className={inspectorMuted}>{empty}</p>
  const long = value.length > 220 || value.split("\n").length > 4
  return (
    <div>
      <p className={cn(inspectorValue, "whitespace-pre-wrap", !open && long && "line-clamp-4")}>
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

export type ProjectDetailsData = {
  client: string
  siteName: string | null
  siteAddress: string | null
  typeOfWorks: string | null
  description: string | null
  requestedBy: string | null
  dateRequested: string | null
  originalDesigner: string | null
  originalFee: number | null
  quoteReference: string | null
}

export function ProjectDetailsCard({ data }: { data: ProjectDetailsData }) {
  return (
    <section className={inspectorCard}>
      <h4 className={inspectorHeading}>Project Details</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Meta label="Client" value={data.client} important />
        <Meta label="Site" value={data.siteName} important />
        <Meta label="Site Address" value={data.siteAddress} fullWidth important />
        <Meta label="Type of Works" value={data.typeOfWorks} />
        <Meta label="Requested By" value={data.requestedBy} important />
        <Meta label="Date Requested" value={safeDateLabel(data.dateRequested) || null} />
        <Meta
          label="Original Fee"
          value={data.originalFee == null ? "No fee set" : formatGBP(data.originalFee)}
          important
        />
        <Meta
          label="Original Designer"
          value={data.originalDesigner?.trim() ? data.originalDesigner : "Not assigned"}
          important
        />
        <Meta label="Original Checker" value="Not assigned" important />
        <Meta label="Quote Reference" value={data.quoteReference} />
      </div>
      <div className="mt-3 border-t border-bd pt-3">
        <p className={inspectorLabel}>Description of Works</p>
        <ExpandableText text={data.description} empty="No description recorded" />
      </div>
    </section>
  )
}

export function DrawingStatusCard({
  currentWork,
  revLabel,
  designer,
  designers,
  dueDate,
  requestedBy,
  requestedDate,
  workValue,
  nextAction,
  patchUrl,
  onChanged,
}: {
  currentWork: ReturnType<typeof getCurrentWorkItem>
  revLabel: string
  designer: string
  designers: string[]
  dueDate: string | null
  requestedBy: string | null
  requestedDate: string | null
  workValue: number | null
  nextAction: string
  patchUrl?: string
  onChanged: () => void
}) {
  const active = currentWork.type !== "none" && Boolean(currentWork.id)
  const label =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : currentWork.type === "original"
        ? "Original"
        : "Complete"
  const due = dueLabel(dueDate)
  const overdue = due.startsWith("Overdue")

  return (
    <section className={inspectorCard}>
      <h4 className={inspectorHeading}>Drawing Status</h4>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-bd pb-3">
        <span className="text-sm font-semibold text-t1">{label}</span>
        {active ? (
          <WorkItemStatusSelector
            workItemType={currentWork.type === "revision" ? "revision" : "original"}
            workItemId={currentWork.id!}
            currentStatus={currentWork.status}
            revisionLabel={currentWork.type === "revision" ? currentWork.revisionLabel : null}
            patchUrl={patchUrl}
            size="md"
            onStatusChanged={onChanged}
          />
        ) : (
          <DrawingStatusCompleteLabel detail="No Active Work" className="text-right" />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className={inspectorLabel}>Designer</p>
          {active ? (
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
          ) : (
            <p className={inspectorMuted}>{missingLabel(designer, "Unassigned")}</p>
          )}
        </div>
        <div>
          <p className={inspectorLabel}>Checker</p>
          <p className={inspectorMuted}>Not assigned</p>
        </div>
        <Meta label="Requested By" value={requestedBy} />
        <Meta label="Date Requested" value={safeDateLabel(requestedDate) || null} />
        <div>
          <p className={inspectorLabel}>Due</p>
          <p className={cn(inspectorValue, overdue && "text-dn")}>{due}</p>
        </div>
        <div>
          <p className={inspectorLabel}>Next Action</p>
          <p className={inspectorValue}>{nextAction}</p>
        </div>
        {workValue != null && (
          <Meta
            label={currentWork.type === "revision" ? "Current Work Value" : "Original Fee"}
            value={formatGBP(workValue)}
          />
        )}
      </div>
    </section>
  )
}

export type RevisionDetailsData = {
  label: string
  reason: string | null
  requestedBy: string | null
  requestedDate: string | null
  designer: string | null
  billable: boolean
  fee: number | null
}

export function RevisionDetailsCard({ data }: { data: RevisionDetailsData }) {
  const feeLabel =
    !data.billable ? "Free revision"
      : data.fee == null ? "Not set"
        : formatGBP(data.fee)

  return (
    <section className={inspectorCard}>
      <h4 className={inspectorHeading}>Revision Details</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Meta label="Revision" value={data.label} important />
        <Meta label="Chargeable" value={data.billable ? "Yes" : "No"} important />
        <Meta label="Requested By" value={data.requestedBy} />
        <Meta label="Date Requested" value={safeDateLabel(data.requestedDate) || null} />
        <Meta
          label="Revision Designer"
          value={data.designer?.trim() ? data.designer : "Not assigned"}
          important
        />
        <Meta label="Revision Checker" value="Not assigned" important />
        <Meta label="Revision Fee" value={feeLabel} important />
      </div>
      <div className="mt-3 border-t border-bd pt-3">
        <p className={inspectorLabel}>Reason for Revision</p>
        <ExpandableText text={data.reason} empty="No reason recorded" />
      </div>
    </section>
  )
}

export type QuoteCardItem = LinkedQuoteSummary & {
  scopeLabel?: string
}

export function QuotationCard({
  originalQuote,
  revisionQuote,
  unlinkBusy,
  onOpen,
  onChange,
  onUnlink,
}: {
  originalQuote: QuoteCardItem | null
  revisionQuote: QuoteCardItem | null
  unlinkBusy: boolean
  onOpen: (quote: QuoteCardItem) => void
  onChange: () => void
  onUnlink: (quote: QuoteCardItem) => void
}) {
  const hasAny = Boolean(originalQuote || revisionQuote)

  return (
    <section className={inspectorCard}>
      <h4 className={inspectorHeading}>Quotation</h4>
      {!hasAny ? (
        <p className={inspectorMuted}>No quotation attached</p>
      ) : (
        <div className="space-y-3">
          {originalQuote && (
            <QuoteBlock
              title={revisionQuote ? "Original Quote" : undefined}
              quote={originalQuote}
              unlinkBusy={unlinkBusy}
              onOpen={() => onOpen(originalQuote)}
              onChange={onChange}
              onUnlink={() => onUnlink(originalQuote)}
            />
          )}
          {revisionQuote && (
            <QuoteBlock
              title="Revision Quote"
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

function QuoteBlock({
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
    <div className={cn(title && "border-t border-bd pt-3 first:border-0 first:pt-0")}>
      {title && <p className="mb-1 text-xs font-medium text-t2">{title}</p>}
      <p className="truncate text-sm font-semibold text-t1">
        {quote.quoteNumber}
        {quote.scopeLabel ? (
          <span className="ml-1.5 text-xs font-normal text-t3">· {quote.scopeLabel}</span>
        ) : null}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-t2">
        <span>{formatGBP(quote.quoteValue)}</span>
        <span className="text-t4">·</span>
        <QuoteStatusBadge status={quote.status} />
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" className="text-xs font-medium text-ac2 hover:underline" onClick={onOpen}>
          Open Quote
        </button>
        <button type="button" className="text-xs font-medium text-t2 hover:underline" onClick={onChange}>
          Change
        </button>
        <button
          type="button"
          className="text-xs font-medium text-t3 hover:underline disabled:opacity-50"
          onClick={onUnlink}
          disabled={unlinkBusy}
        >
          {unlinkBusy ? "Removing…" : "Remove Link"}
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

export function CATIICheckCard({
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
    <section className={inspectorCard}>
      <h4 className={inspectorHeading}>CATII Check</h4>
      {activeCheck ? (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-t1">{activeCheck.label}</p>
          {activeCheck.revisionLabel && (
            <p className="text-xs text-t3">{activeCheck.revisionLabel}</p>
          )}
          <p className="text-xs text-t3">Created {safeDateLabel(activeCheck.createdAt)}</p>
          <button
            type="button"
            className="text-xs font-medium text-ac2 hover:underline"
            onClick={() => onOpen(activeCheck.id)}
          >
            Open Check
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className={inspectorMuted}>No CATII check for {activeLabel}</p>
          {previousCheck && (
            <p className="text-xs text-t3">
              Latest previous check: {previousCheck.revisionLabel ?? "Original"} ·{" "}
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
          {canCreate && (
            <button
              type="button"
              className="text-xs font-medium text-t2 hover:underline disabled:opacity-50"
              onClick={onCreate}
              disabled={busy}
            >
              {busy ? "Creating…" : `Create CATII Check for ${activeLabel}`}
            </button>
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

export function RevisionHistoryCard({ revisions }: { revisions: HistoryRevision[] }) {
  return (
    <section>
      <h4 className={inspectorHeading}>Revision History</h4>
      {revisions.length === 0 ? (
        <div className={inspectorCard}>
          <p className={inspectorMuted}>Original design only</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {revisions.map(rev => {
            const title = rev.letter ? `Rev ${rev.letter}` : "Original"
            const feePart = !rev.billable
              ? "Free"
              : rev.fee == null
                ? "Fee not set"
                : formatGBP(rev.fee)
            return (
              <li
                key={rev.id}
                className={cn(
                  inspectorCard,
                  "p-3",
                  rev.isCurrent ? "border-l-[3px] border-l-ac2" : "opacity-90",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-t1">{title}</p>
                  {rev.isCurrent ? (
                    <span className="inline-flex rounded border border-ac2/30 bg-ac2-bg px-1.5 py-0.5 text-[10px] font-medium text-ac2">
                      Active
                    </span>
                  ) : rev.status === "ISSUED" ? (
                    <span className="inline-flex rounded border border-ok-bd bg-ok-bg px-1.5 py-0.5 text-[10px] font-medium text-ok-tx">
                      Complete
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-t3">
                  <DrawingStatusBadge status={rev.status} />
                  <span>·</span>
                  <span>{missingLabel(rev.designer, "Unassigned")}</span>
                </div>
                <p className="mt-0.5 text-xs text-t3">{safeDateLabel(rev.createdAt)}</p>
                {rev.reason?.trim() && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-t2">{rev.reason.trim()}</p>
                )}
                <p className="mt-1.5 text-xs text-t3">
                  {rev.billable ? "Chargeable" : "Free"}
                  {" · "}
                  {feePart}
                  {rev.quoteNumber ? ` · Quote ${rev.quoteNumber}` : ""}
                  {" · "}
                  {rev.hasCat2 ? "CATII on file" : "No CATII check"}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
