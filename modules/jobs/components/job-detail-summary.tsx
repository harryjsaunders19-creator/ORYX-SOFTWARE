"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import { formatGBP, parseLocalDate, totalJobCommercialValue } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="py-2.5 border-b border-[#E5E7EB]">
      <p className="text-[11px] uppercase tracking-wide text-t4 mb-1">{label}</p>
      <p className="text-sm text-t1 min-w-0 break-words">{value}</p>
    </div>
  )
}

export function JobDetailSummary({
  job,
  revisionFamily,
}: {
  job: Job & { currentRevision?: Job | null }
  revisionFamily: RevisionFamilyResponse | null
}) {
  const focus = job.currentRevision ?? job
  const currentEntry = revisionFamily?.chain.find(e => e.isCurrent) ?? null
  const revLabel = currentEntry?.isOriginal || !currentEntry?.revisionLetter
    ? "Original"
    : `Rev ${currentEntry.revisionLetter}`

  const site = [job.siteAddress, job.siteName].filter(Boolean).join(" · ") || job.address || "—"
  const deadline = (focus.requiredByDate ?? job.requiredByDate)
    ? format(parseLocalDate((focus.requiredByDate ?? job.requiredByDate)!), "d MMM yyyy")
    : "—"

  const revisions = revisionFamily?.revisions ?? []
  const revisionFees = revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)
  const originalTotal = totalJobCommercialValue(job) ?? 0
  const totalQuoted = originalTotal + revisionFees

  let totalInvoiced = 0
  if (job.billingStatus === "INVOICED") totalInvoiced += totalJobCommercialValue(job) ?? 0
  for (const r of revisions) {
    if (r.billingStatus === "INVOICED") totalInvoiced += r.quoteValue ?? 0
  }
  const outstanding = totalQuoted - totalInvoiced

  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
      <h2 className="text-sm font-semibold text-t1 mb-2">Job summary</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
        <Cell label="Client" value={job.clientCompany} />
        <Cell label="Site" value={site} />
        <Cell label="Requested by" value={job.requestedBy || "—"} />
        <Cell label="Created" value={format(new Date(job.dateCreated), "d MMM yyyy")} />
        <Cell label="Deadline" value={<span className="tabular-nums">{deadline}</span>} />
        <Cell label="Designer" value={focus.designer?.trim() || job.designer?.trim() || "—"} />
        <Cell label="Current revision" value={revLabel} />
        <Cell
          label="Original quote"
          value={
            <span className="tabular-nums">
              {job.quoteValue != null ? formatGBP(job.quoteValue) : "—"}
            </span>
          }
        />
        <Cell
          label="Outstanding"
          value={
            <span className="tabular-nums font-medium">
              {formatGBP(outstanding) ?? "—"}
            </span>
          }
        />
      </div>
    </section>
  )
}
