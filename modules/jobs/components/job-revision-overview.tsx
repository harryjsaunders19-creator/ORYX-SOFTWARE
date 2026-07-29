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
      isCurrent: originalEntry?.isCurrent ?? false,
      isOriginal: true,
    },
    ...revisionEntries.map(e => ({
      id: e.id,
      label: `Rev ${e.revisionLetter ?? "—"}`,
      isCurrent: e.isCurrent,
      isOriginal: false,
    })),
  ]

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

        {revisionFamily.revisions.length > 0 && (
          <div className="shrink-0">
            <Pill tone="neutral">{revisionFamily.revisions.length} revision{revisionFamily.revisions.length === 1 ? "" : "s"}</Pill>
          </div>
        )}
      </div>

      {/* Small visual timeline for traceability */}
      <div className="mt-5 overflow-x-auto overscroll-x-contain">
        <div className="flex items-center gap-4 min-w-[520px]">
          {steps.map((s, idx) => (
            <div key={s.id} className="flex items-center gap-4">
              <div className={cn(
                "flex flex-col items-center text-center",
                s.isCurrent && "text-ac",
              )}>
                <div
                  className={cn(
                    "h-8 w-8 rounded-full border flex items-center justify-center",
                    s.isCurrent ? "border-ac bg-ac-bg/40" : "border-bd bg-sr",
                  )}
                  aria-hidden
                >
                  {idx === 0 ? "—" : s.label.split(" ")[1]}
                </div>
                <span className="text-xs text-t3 mt-2 whitespace-nowrap">
                  {s.isOriginal ? "Original" : s.label.replace("Rev ", "Rev ")}
                </span>
                {s.isCurrent && (
                  <span className="mt-1 inline-flex items-center justify-center rounded-md bg-ac text-on-ac px-2 py-0.5 text-[11px] font-semibold">
                    Current
                  </span>
                )}
              </div>
              {idx !== steps.length - 1 && (
                <ArrowRight className={cn("h-4 w-4 shrink-0", s.isCurrent ? "text-ac" : "text-t4")} aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto overscroll-x-contain">
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
              <th className="px-4 py-3 w-[80px]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-bd">
            {/* Pinned Original row */}
            <tr
              id={`revision-row-${originalJob.id}`}
              className={cn(
                "cursor-pointer transition-colors hover:bg-pg/30",
                selectedRevisionId === originalJob.id && "bg-ac-bg/20",
              )}
              onClick={() => onSelectedRevisionId(originalJob.id)}
              role="button"
              tabIndex={0}
              aria-label={`Select ${originalJob.drawingNumber} revision row`}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") onSelectedRevisionId(originalJob.id)
              }}
            >
              <td className="px-4 py-3 whitespace-nowrap font-semibold text-t1">
                <div className="flex items-center gap-2">
                  <span>Original</span>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">
                {originalJob.drawingNumber}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <StatusBadge status={originalEntry?.status ?? originalJob.status} />
              </td>
              <td className="px-4 py-3 text-t3 whitespace-pre-wrap">
                —
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-t4">—</td>
              <td className="px-4 py-3 whitespace-nowrap text-t2">
                {originalEntry?.designer ?? originalJob.designer ?? "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums text-t3">
                {originalJob.dateCompleted ? format(parseLocalDate(originalJob.dateCompleted), "d MMM yyyy") : "—"}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-2">
                  <Receipt className={cn(
                    "h-4 w-4",
                    originalJob.billingStatus === "INVOICED" ? "text-ok-ic" : "text-t4",
                  )} aria-hidden />
                  <span className="text-sm font-medium text-t1">{safeInvoiceLabel(originalJob.billingStatus)}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-t4">
                <ArrowRight className="h-4 w-4" aria-hidden />
              </td>
            </tr>

            {revisionEntries.map(entry => {
              const revJob = revisionById.get(entry.id)
              if (!revJob) return null

              const isCurrent = !!entry.isCurrent
              const fee = revJob.quoteValue
              const feeStr = fee == null ? "—" : formatGBP(fee) ?? "—"
              const amendments = entry.notes?.trim() ? entry.notes : "—"
              const completed = revJob.dateCompleted ? format(parseLocalDate(revJob.dateCompleted), "d MMM yyyy") : "—"
              const designer = entry.designer ?? revJob.designer ?? "—"
              const invoiceText = safeInvoiceLabel(revJob.billingStatus)

              return (
                <tr
                  key={entry.id}
                  id={`revision-row-${revJob.id}`}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-pg/30",
                    isCurrent && "bg-ac-bg/40 border-l-4 border-l-ac",
                    selectedRevisionId === revJob.id && !isCurrent && "bg-ac-bg/20",
                  )}
                  onClick={() => onSelectedRevisionId(revJob.id)}
                  role="button"
                  tabIndex={0}
                  aria-current={isCurrent ? "true" : undefined}
                  aria-label={`Select ${revJob.drawingNumber} revision row`}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") onSelectedRevisionId(revJob.id)
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap font-semibold text-t1">
                    <div className="flex items-center gap-2">
                      <span>{entry.revisionLetter ? `Rev ${entry.revisionLetter}` : "Revision"}</span>
                      {isCurrent && (
                        <span className="bg-ac text-on-ac rounded-full px-2 py-0.5 text-[11px] font-semibold">
                          Current
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-ac whitespace-nowrap font-semibold">
                    {revJob.drawingNumber}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={entry.status ?? revJob.status} />
                  </td>
                  <td className="px-4 py-3 text-t3 whitespace-pre-wrap">{amendments}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-t3">
                    {feeStr}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-t2">{designer}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-t3">{completed}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <Receipt className={cn(
                        "h-4 w-4",
                        revJob.billingStatus === "INVOICED" ? "text-ok-ic" : revJob.billingStatus === "READY" ? "text-wn-ic" : "text-t4",
                      )} aria-hidden />
                      <span className="text-sm font-medium text-t1">{invoiceText}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-t4">
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        {revisionFamily.canAddRevision && (
          <Button variant="outline" onClick={onAddRevision}>
            <Plus className="h-3.5 w-3.5" />
            + Add Revision
          </Button>
        )}
      </div>
    </section>
  )
}

