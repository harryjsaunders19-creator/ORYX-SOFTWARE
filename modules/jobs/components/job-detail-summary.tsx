"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import { formatGBP, parseLocalDate, totalJobCommercialValue, cn, getJobDeadlineInfo } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

function MetaBlock({
  label,
  value,
  accent,
}: {
  label: string
  value: ReactNode
  accent?: boolean
}) {
  return (
    <div className={cn("flex flex-col", accent && "border-l-2 border-bd pl-3")}>
      <span className={cn(Typography.Helper, "uppercase tracking-tighter text-t3 mb-0.5")}>
        {label}
      </span>
      <span className={cn(Typography.Small, accent ? "font-bold text-t1" : "font-semibold text-t1")}>
        {value}
      </span>
    </div>
  )
}

/** Sidebar “Project Metadata” card — Stitch High Precision layout. */
export function JobDetailSummary({
  job,
  revisionFamily: _revisionFamily,
}: {
  job: Job & { currentRevision?: Job | null }
  revisionFamily: RevisionFamilyResponse | null
}) {
  const focus = job.currentRevision ?? job
  const deadlineRaw = focus.requiredByDate ?? job.requiredByDate
  const deadline = deadlineRaw
    ? format(parseLocalDate(deadlineRaw), "d MMM yyyy")
    : "—"
  const dl = getJobDeadlineInfo({ requiredByDate: deadlineRaw, status: focus.status })

  return (
    <section className="rounded-lg border border-bd bg-sr p-5 space-y-4">
      <h3
        className={cn(
          Typography.Helper,
          "font-bold uppercase tracking-widest text-t3 border-b border-surface-low pb-3",
        )}
      >
        Project Metadata
      </h3>

      <div className="space-y-4">
        <MetaBlock label="Created" value={format(new Date(job.dateCreated), "d MMM yyyy")} />
        <MetaBlock label="Requested by" value={job.requestedBy || "—"} />
        <MetaBlock
          label="Required By (Deadline)"
          value={
            <span
              className={cn(
                "tabular-nums",
                dl.severity === "overdue" && "text-dn-tx",
                (dl.severity === "today" || dl.severity === "soon") && "text-wn-tx",
              )}
            >
              {deadline}
            </span>
          }
          accent
        />
      </div>

      <div className="pt-2 border-t border-surface-low space-y-3">
        <div className="flex justify-between items-center gap-3">
          <span className={cn(Typography.Helper, "uppercase text-t3")}>Checker</span>
          <span className={cn(Typography.Small, "font-medium text-t3")}>—</span>
        </div>
        <div className="flex justify-between items-center gap-3">
          <span className={cn(Typography.Helper, "uppercase text-t3")}>CAT II Reviewer</span>
          <span className={cn(Typography.Small, "font-medium text-t3")}>—</span>
        </div>
      </div>

      {/* Commercial glance kept available but secondary — not in Stitch mock chrome */}
      {(job.quoteValue != null || totalJobCommercialValue(job) != null) && (
        <div className="pt-2 border-t border-surface-low space-y-2">
          <div className="flex justify-between items-center gap-3">
            <span className={cn(Typography.Helper, "uppercase text-t3")}>Original Quote</span>
            <span className={cn(Typography.Small, "font-semibold tabular-nums text-t1")}>
              {job.quoteValue != null ? formatGBP(job.quoteValue) : "—"}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
