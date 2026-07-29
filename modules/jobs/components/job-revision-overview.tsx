"use client"
import { format } from "date-fns"
import { ArrowRight, GitBranch, Plus, Receipt } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn, formatGBP, parseLocalDate } from "@/shared/utils/utils"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { invoiceLabel } from "./parent-job-helpers"
import { Pill } from "./job-page-primitives"

function safeInvoiceLabel(billingStatus: string | null | undefined) {
  if (!billingStatus) return "—"
  return invoiceLabel(billingStatus)
}

export function JobRevisionOverview({
  job: _job,
  revisionFamily,
  isLoading,
  selectedRevisionId,
  onSelectedRevisionId,
  onAddRevision,
}: {
  job: Job
  revisionFamily: RevisionFamilyResponse | null
  isLoading: boolean
  selectedRevisionId: string | null
  onSelectedRevisionId: (id: string | null) => void
  onAddRevision: () => void
}) {
  if (isLoading && !revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr p-6">
        <div className="space-y-3">
          <div className="h-6 w-48 skeleton rounded" />
          <div className="h-10 w-full skeleton rounded" />
          <div className="h-64 w-full skeleton rounded" />
        </div>
      </section>
    )
  }

  if (!revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr p-6">
        <p className="text-sm text-t4">Revision history unavailable.</p>
      </section>
    )
  }

  const originalJob = revisionFamily.original
  const chain = revisionFamily.chain
  const originalEntry = chain.find(e => e.isOriginal) ?? null
  const revisionEntries = chain.filter(e => !e.isOriginal)

  const revisionById = new Map<string, Job>()
  for (const r of revisionFamily.revisions) revisionById.set(r.id, r)

  const steps = [
    {
      id: originalJob.id,
      label: "Original",
      letter: "O",
      isCurrent: originalEntry?.isCurrent ?? false,
      isOriginal: true,
    },
    ...revisionEntries.map(e => ({
      id: e.id,
      label: `Rev ${e.revisionLetter ?? "—"}`,
      letter: e.revisionLetter ?? "—",
      isCurrent: e.isCurrent,
      isOriginal: false,
    })),
  ]

  const selectRow = (id: string) => {
    onSelectedRevisionId(id)
    // Defer scroll so highlight paints first.
    requestAnimationFrame(() => {
      document.getElementById(`revision-row-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      })
    })
  }

  return (
    <section className="rounded-xl border border-bd bg-sr p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-t1 inline-flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-ac" />
            Revision History
          </h2>
          <p className="text-sm text-t3 mt-0.5">Every revision linked to this original project.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {revisionFamily.revisions.length > 0 && (
            <Pill tone="neutral">
              {revisionFamily.revisions.length} revision{revisionFamily.revisions.length === 1 ? "" : "s"}
            </Pill>
          )}
          {revisionFamily.canAddRevision && (
            <Button variant="primary" size="sm" onClick={onAddRevision}>
              <Plus className="h-3.5 w-3.5" />
              Add Revision
              {revisionFamily.nextRevisionLetter ? ` ${revisionFamily.nextRevisionLetter}` : ""}
            </Button>
          )}
        </div>
      </div>

      {/* Compact horizontal timeline */}
      <div className="mt-5 overflow-x-auto overscroll-x-contain">
        <div className="flex items-center gap-3 min-w-[320px] pb-1">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => selectRow(s.id)}
                className={cn(
                  "flex flex-col items-center text-center rounded-lg px-2 py-1 transition-colors",
                  "hover:bg-pg/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac/40",
                  selectedRevisionId === s.id && "bg-ac-bg/30",
                )}
                aria-current={s.isCurrent ? "step" : undefined}
                aria-label={`Select ${s.label}`}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full border flex items-center justify-center text-xs font-semibold",
                    s.isCurrent
                      ? "border-ac bg-ac text-on-ac"
                      : "border-bd bg-pg text-t2",
                  )}
                  aria-hidden
                >
                  {s.isOriginal ? "O" : s.letter}
                </div>
                <span className={cn(
                  "text-xs mt-1.5 whitespace-nowrap",
                  s.isCurrent ? "text-ac font-semibold" : "text-t3",
                )}>
                  {s.isOriginal ? "Original" : s.label}
                </span>
                {s.isCurrent && (
                  <span className="mt-1 inline-flex items-center justify-center rounded-md bg-ac text-on-ac px-2 py-0.5 text-[11px] font-semibold">
                    Current
                  </span>
                )}
              </button>
              {idx !== steps.length - 1 && (
                <ArrowRight className={cn("h-4 w-4 shrink-0", s.isCurrent ? "text-ac" : "text-t4")} aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto overscroll-x-contain rounded-lg border border-bd">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="bg-surface-low border-b border-bd text-xs">
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[110px]">Revision</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap">Reference</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[150px]">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[260px]">Amendments Required</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[120px]">Fee</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[160px]">Designer</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[140px]">Completed</th>
              <th className="px-4 py-3 text-left font-semibold text-t3 whitespace-nowrap w-[190px]">Invoice Status</th>
              <th className="px-4 py-3 w-[48px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            <RevisionTableRow
              id={originalJob.id}
              revisionLabel="Original"
              drawingNumber={originalJob.drawingNumber}
              status={originalEntry?.status ?? originalJob.status}
              amendments="—"
              fee="—"
              designer={originalEntry?.designer ?? originalJob.designer ?? "—"}
              completed={originalJob.dateCompleted ? format(parseLocalDate(originalJob.dateCompleted), "d MMM yyyy") : "—"}
              billingStatus={originalJob.billingStatus}
              isCurrent={!!originalEntry?.isCurrent}
              isSelected={selectedRevisionId === originalJob.id}
              onSelect={() => selectRow(originalJob.id)}
            />

            {revisionEntries.map(entry => {
              const revJob = revisionById.get(entry.id)
              if (!revJob) return null

              const isCurrent = !!entry.isCurrent
              const fee = revJob.quoteValue
              const feeStr = fee == null ? "—" : formatGBP(fee) ?? "—"
              const amendments = entry.notes?.trim() ? entry.notes : "—"
              const completed = revJob.dateCompleted ? format(parseLocalDate(revJob.dateCompleted), "d MMM yyyy") : "—"
              const designer = entry.designer ?? revJob.designer ?? "—"

              return (
                <RevisionTableRow
                  key={entry.id}
                  id={revJob.id}
                  revisionLabel={entry.revisionLetter ? `Rev ${entry.revisionLetter}` : "Revision"}
                  drawingNumber={revJob.drawingNumber}
                  status={entry.status ?? revJob.status}
                  amendments={amendments}
                  fee={feeStr}
                  designer={designer}
                  completed={completed}
                  billingStatus={revJob.billingStatus}
                  isCurrent={isCurrent}
                  isSelected={selectedRevisionId === revJob.id}
                  onSelect={() => selectRow(revJob.id)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RevisionTableRow({
  id,
  revisionLabel,
  drawingNumber,
  status,
  amendments,
  fee,
  designer,
  completed,
  billingStatus,
  isCurrent,
  isSelected,
  onSelect,
}: {
  id: string
  revisionLabel: string
  drawingNumber: string
  status: string
  amendments: string
  fee: string
  designer: string
  completed: string
  billingStatus: string | null | undefined
  isCurrent: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const invoiceText = safeInvoiceLabel(billingStatus)

  return (
    <tr
      id={`revision-row-${id}`}
      className={cn(
        "cursor-pointer transition-colors hover:bg-pg/40",
        isCurrent && "bg-ac-bg/35",
        isSelected && !isCurrent && "bg-ac-bg/15",
        isSelected && isCurrent && "bg-ac-bg/45",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-current={isCurrent ? "true" : undefined}
      aria-label={`Select ${drawingNumber}${isSelected ? ", selected" : ""}`}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <td
        className={cn(
          "px-4 py-3 whitespace-nowrap font-semibold text-t1",
          isCurrent && "border-l-4 border-l-ac",
          !isCurrent && "border-l-4 border-l-transparent",
        )}
      >
        <div className="flex items-center gap-2">
          <span>{revisionLabel}</span>
          {isCurrent && (
            <span className="bg-ac text-on-ac rounded-md px-2 py-0.5 text-[11px] font-semibold">
              Current
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">
        {drawingNumber}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={status} />
      </td>
      <td className="px-4 py-3 text-t3 whitespace-pre-wrap">{amendments}</td>
      <td className="px-4 py-3 whitespace-nowrap text-t3">{fee}</td>
      <td className="px-4 py-3 whitespace-nowrap text-t2">{designer}</td>
      <td className="px-4 py-3 whitespace-nowrap tabular-nums text-t3">{completed}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="inline-flex items-center gap-2">
          <Receipt
            className={cn(
              "h-4 w-4",
              billingStatus === "INVOICED"
                ? "text-ok-ic"
                : billingStatus === "READY"
                  ? "text-wn-ic"
                  : "text-t4",
            )}
            aria-hidden
          />
          <span className="text-sm font-medium text-t1">{invoiceText}</span>
        </span>
      </td>
      <td className="px-4 py-3 text-t4">
        <ArrowRight className="h-4 w-4" aria-hidden />
      </td>
    </tr>
  )
}
