"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatGBP } from "@/shared/utils/utils"
import { shortStatusLabel } from "./jobs-register-helpers"

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
      <div className="flex items-center justify-between gap-2 mb-6">
        <h4 className="text-[11px] font-bold uppercase tracking-widest text-t3">
          Revision Timeline
        </h4>
        <span className="text-[10px] uppercase text-t4">
          {revisions.length} Registered
        </span>
      </div>
      <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-bd/40">
        {revisions.map(rev => (
          <RevisionEntry key={rev.id} revision={rev} />
        ))}
      </div>
    </section>
  )
}

function RevisionEntry({ revision }: { revision: InspectorRevision }) {
  const [open, setOpen] = useState(revision.isCurrent)
  const label = revision.letter
    ? `Revision ${revision.letter}`
    : revision.title || "Original Design"

  if (revision.isCurrent) {
    return (
      <div className="relative pl-8">
        <span className="absolute left-1.5 top-2 h-3.5 w-3.5 rounded-full bg-blue-600 border-[2.5px] border-sr z-10" aria-hidden />
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="text-base font-bold text-blue-900">{label}</h5>
                <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                  Active
                </span>
              </div>
              <p className="text-xs text-blue-700/80 mt-0.5">
                Updated on{" "}
                {new Date(revision.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
                {revision.designer ? ` by ${revision.designer}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-sm font-bold text-blue-900 tabular-nums">
                {formatGBP(revision.value)}
              </span>
              <span className="block text-[9px] font-bold uppercase tracking-tighter text-blue-700/60">
                {revision.billable ? "Chargeable" : "Free"}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-blue-700/60 mb-1">
                Reason for Revision
              </p>
              <p className="text-blue-950/90 whitespace-pre-wrap">{revision.reason || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-blue-700/60 mb-1">
                Internal Notes
              </p>
              <p className="text-blue-950/90 whitespace-pre-wrap">{revision.notes || "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] border-t border-blue-100 pt-3">
            <Meta label="Drawing Status" value={revision.drawingStatus} />
            <Meta label="Invoice Status" value={revision.invoiceStatus} />
            <Meta label="Completion" value={revision.completionStatus} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative pl-8">
      <span className="absolute left-1.5 top-2 h-3.5 w-3.5 rounded-full bg-t4 border-[2.5px] border-sr z-10" aria-hidden />
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 text-left rounded-lg border border-bd bg-sr p-3 hover:bg-surface-low transition-colors"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-t1">{label}</p>
          <p className="text-xs text-t3 mt-0.5">
            {shortStatusLabel(revision.status)}{" "}
            {new Date(revision.createdAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {revision.designer ? ` · Designer: ${revision.designer}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold tabular-nums text-t1">
            {formatGBP(revision.value)}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-t3" /> : <ChevronRight className="h-4 w-4 text-t3" />}
        </div>
      </button>
      {open && (
        <div className="mt-2 ml-0 space-y-2 rounded-lg border border-bd bg-sr p-3 text-sm">
          <Meta label="Status" value={shortStatusLabel(revision.status)} />
          <Meta label="Designer" value={revision.designer || "—"} />
          <Meta label="Reason for Amendment" value={revision.reason || "—"} />
          <Meta label="Internal Notes" value={revision.notes || "—"} />
          <Meta label="Chargeable / Free" value={revision.billable ? "Chargeable" : "Free"} />
          <Meta label="Revision Value" value={formatGBP(revision.value)} />
          <Meta label="Drawing Status" value={revision.drawingStatus} />
          <Meta label="Invoice Status" value={revision.invoiceStatus} />
          <Meta label="Completion Status" value={revision.completionStatus} />
        </div>
      )}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-t3">{label}</p>
      <p className="text-t1 mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  )
}
