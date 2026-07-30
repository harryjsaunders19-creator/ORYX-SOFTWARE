"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn, formatGBP } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { revisionBadgeLabel, shortStatusLabel } from "./jobs-register-helpers"

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
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className={cn(Typography.CardTitle, "text-t1")}>Revision Timeline</h3>
        <span className="text-xs text-t3 tabular-nums">{revisions.length} registered</span>
      </div>
      <ol className="relative space-y-3 pl-5">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-bd" aria-hidden />
        {revisions.map(rev => (
          <RevisionEntry key={rev.id} revision={rev} />
        ))}
      </ol>
    </section>
  )
}

function RevisionEntry({ revision }: { revision: InspectorRevision }) {
  const [open, setOpen] = useState(revision.isCurrent)
  const label = revision.letter
    ? revisionBadgeLabel(revision.letter)
    : revision.title || "Original"

  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-5 top-2 h-3.5 w-3.5 rounded-full border-[2.5px] border-sr",
          revision.isCurrent ? "bg-rs-ic shadow-[0_0_0_2px_var(--color-rs-bd)]" : "bg-t4",
        )}
        aria-hidden
      />
      <div
        className={cn(
          "rounded-xl border p-3 transition-colors",
          revision.isCurrent
            ? "border-rs-bd bg-rs-bg/30"
            : "border-bd bg-sr",
        )}
      >
        <button
          type="button"
          className="flex w-full items-start justify-between gap-2 text-left"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("text-sm text-t1", revision.isCurrent ? "font-semibold" : "font-medium")}>
                {label}
              </span>
              {revision.isCurrent && (
                <span className="rounded-md bg-rs-ic px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Current
                </span>
              )}
              <StatusBadge status={revision.status} />
            </div>
            <p className="mt-1 text-xs text-t3">
              {new Date(revision.createdAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {revision.designer ? ` · ${revision.designer}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-semibold tabular-nums text-t1">
              {formatGBP(revision.value)}
            </span>
            {open ? (
              <ChevronDown className="h-4 w-4 text-t3" />
            ) : (
              <ChevronRight className="h-4 w-4 text-t3" />
            )}
          </div>
        </button>

        {open && (
          <div className="mt-3 space-y-2 border-t border-bd/60 pt-3 text-sm">
            <Field label="Status" value={shortStatusLabel(revision.status)} />
            <Field label="Designer" value={revision.designer || "—"} />
            <Field label="Reason for Amendment" value={revision.reason || "—"} />
            <Field label="Internal Notes" value={revision.notes || "—"} />
            <Field
              label="Chargeable / Free"
              value={revision.billable ? "Chargeable" : "Free"}
            />
            <Field label="Revision Value" value={formatGBP(revision.value)} />
            <Field label="Drawing Status" value={revision.drawingStatus} />
            <Field label="Invoice Status" value={revision.invoiceStatus} />
            <Field label="Completion Status" value={revision.completionStatus} />
          </div>
        )}
      </div>
    </li>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-t3">{label}</p>
      <p className="text-t1 mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
