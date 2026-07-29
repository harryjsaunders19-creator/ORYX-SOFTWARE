"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import { formatGBP, parseLocalDate, totalJobCommercialValue } from "@/shared/utils/utils"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

function Row({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-3 text-sm">
      <span className={cn(Typography.Small, "text-t3 shrink-0")}>{label}</span>
      <span
        className={cn(
          Typography.Small,
          "font-semibold text-right min-w-0",
          muted ? "text-t3 font-normal" : "text-t1",
        )}
      >
        {value}
      </span>
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

  const designer = focus.designer?.trim() || job.designer?.trim() || "Unassigned"

  return (
    <section className="rounded-xl border border-bd bg-sr p-5 space-y-6">
      <h3
        className={cn(
          Typography.Small,
          "font-bold uppercase tracking-wider text-t1 border-b border-surface-low pb-3",
        )}
      >
        Job Summary
      </h3>

      <div className="space-y-4">
        <Row label="Requested by" value={job.requestedBy || "—"} muted={!job.requestedBy} />
        <Row label="Created" value={format(new Date(job.dateCreated), "d MMM yyyy")} />
        <Row label="Deadline" value={<span className="tabular-nums">{deadline}</span>} />
        <Row
          label="Original Quote"
          value={
            <span className="tabular-nums">
              {job.quoteValue != null ? formatGBP(job.quoteValue) : "—"}
            </span>
          }
          muted={job.quoteValue == null}
        />
        <Row
          label="Outstanding"
          value={<span className="tabular-nums">{formatGBP(outstanding) ?? "—"}</span>}
        />
      </div>

      <div className="pt-4 border-t border-surface-low space-y-3">
        <Row label="Designer" value={designer} muted={designer === "Unassigned"} />
        <Row label="Checker" value="—" muted />
        <Row label="CAT II Reviewer" value="—" muted />
      </div>
    </section>
  )
}
