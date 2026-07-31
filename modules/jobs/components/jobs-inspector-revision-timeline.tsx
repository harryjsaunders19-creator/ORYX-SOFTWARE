"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { missingLabel, shortStatusLabel } from "./jobs-register-helpers"
import { infoCardClassName } from "@/shared/layouts/inspector"

function safeDateLabel(value: string | null | undefined): string {
  if (!value) return "Unknown date"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "Unknown date"
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export interface InspectorRevision {
  id: string
  letter: string | null
  title: string
  status: string
  createdAt: string
  designer: string
  reason: string | null
  notes: string | null
  billable: boolean
  value: number | null
  drawingStatus: string
  invoiceStatus: string
  completionStatus: string
  isCurrent: boolean
}

export function JobsInspectorRevisionTimeline({
  revisions,
}: {
  revisions: InspectorRevision[]
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-t3">
          Revision Timeline
        </h4>
        <span className="text-xs text-t3">
          {revisions.length} registered
        </span>
      </div>
      <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-bd">
        {revisions.map(rev => (
          <RevisionEntry key={rev.id} revision={rev} />
        ))}
      </div>
    </section>
  )
}

function StatusChip({ children, tone = "neutral" }: {
  children: React.ReactNode
  tone?: "neutral" | "accent" | "ok" | "muted"
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tone === "accent" && "border-ac2/40 bg-ac2-bg text-ac2",
        tone === "ok" && "border-ok-bd bg-ok-bg text-ok-tx",
        tone === "muted" && "border-bd bg-surface-low text-t3",
        tone === "neutral" && "border-bd bg-surface-low text-t2",
      )}
    >
      {children}
    </span>
  )
}

function RevisionEntry({ revision }: { revision: InspectorRevision }) {
  const [open, setOpen] = useState(revision.isCurrent)
  const label = revision.letter
    ? `Revision ${revision.letter}`
    : revision.title || "Original Design"
  const invoice = missingLabel(revision.invoiceStatus, "Not invoiced")
  const reason = missingLabel(revision.reason, "No reason recorded")
  const notes = missingLabel(revision.notes, "No notes")
  const designer = missingLabel(revision.designer, "Unassigned")
  const valueLabel = revision.value == null ? "Not set" : formatGBP(revision.value)
  const isComplete = revision.status === "ISSUED"

  if (revision.isCurrent) {
    return (
      <div className="relative pl-8">
        <span
          className="absolute left-1.5 top-3 z-10 h-3.5 w-3.5 rounded-full border-[2.5px] border-sr bg-ac2"
          aria-hidden
        />
        <div className={cn(infoCardClassName, "border-l-[3px] border-l-ac2 p-4")}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h5 className="text-base font-bold text-t1">{label}</h5>
                <StatusChip tone="accent">Active</StatusChip>
              </div>
              <p className="mt-1 text-xs text-t3">
                Updated {safeDateLabel(revision.createdAt)}
                {revision.designer ? ` · ${revision.designer}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-sm font-bold tabular-nums text-t1">{valueLabel}</span>
              <div className="mt-1">
                <StatusChip tone={revision.billable ? "neutral" : "muted"}>
                  {revision.billable ? "Chargeable" : "Free"}
                </StatusChip>
              </div>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="mb-1 text-xs text-t3">Amendment reason</p>
              <p className="whitespace-pre-wrap text-t1">{reason}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-t3">Internal notes</p>
              <p className="whitespace-pre-wrap text-t1">{notes}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-bd pt-3">
            <StatusChip>{`Drawing: ${revision.drawingStatus}`}</StatusChip>
            <StatusChip>{`Invoice: ${invoice}`}</StatusChip>
            <StatusChip tone={isComplete ? "ok" : "neutral"}>
              {`Completion: ${revision.completionStatus}`}
            </StatusChip>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative pl-8 opacity-90">
      <span
        className="absolute left-1.5 top-3 z-10 h-3.5 w-3.5 rounded-full border-[2.5px] border-sr bg-t4"
        aria-hidden
      />
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 rounded-lg border border-bd bg-sr p-3 text-left transition-colors hover:bg-surface-low"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-t1">{label}</p>
            <StatusChip tone={isComplete ? "ok" : "muted"}>
              {isComplete ? "Completed" : shortStatusLabel(revision.status)}
            </StatusChip>
          </div>
          <p className="mt-0.5 text-xs text-t3">
            {safeDateLabel(revision.createdAt)}
            {revision.designer ? ` · ${revision.designer}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-t2">{valueLabel}</span>
          {open ? <ChevronDown className="h-4 w-4 text-t3" /> : <ChevronRight className="h-4 w-4 text-t3" />}
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-bd bg-sr p-3 text-sm">
          <Meta label="Status" value={shortStatusLabel(revision.status)} />
          <Meta label="Designer" value={designer} />
          <Meta label="Reason for amendment" value={reason} />
          <Meta label="Internal notes" value={notes} />
          <div className="flex flex-wrap gap-1.5 pt-1">
            <StatusChip tone={revision.billable ? "neutral" : "muted"}>
              {revision.billable ? "Chargeable" : "Free"}
            </StatusChip>
            <StatusChip>{`Drawing: ${revision.drawingStatus}`}</StatusChip>
            <StatusChip>{`Invoice: ${invoice}`}</StatusChip>
            <StatusChip tone={isComplete ? "ok" : "neutral"}>
              {`Completion: ${revision.completionStatus}`}
            </StatusChip>
          </div>
          <Meta label="Revision value" value={valueLabel} />
        </div>
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-t3">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-t1">{value}</p>
    </div>
  )
}
