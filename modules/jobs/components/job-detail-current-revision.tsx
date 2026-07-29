"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import { ExternalLink, FileText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { cn, formatGBP, parseLocalDate } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4 py-1 border-b border-surface-low last:border-0">
      <dt className={cn(Typography.Helper, "uppercase tracking-widest font-bold text-t3")}>{label}</dt>
      <dd className={cn(Typography.Small, "font-medium text-t1 text-right min-w-0")}>{value}</dd>
    </div>
  )
}

export function JobDetailCurrentRevision({
  job,
  revisionFamily,
  isLoading,
  onOpenRevisions,
  onAddRevision,
}: {
  job: Job & { currentRevision?: Job | null }
  revisionFamily: RevisionFamilyResponse | null
  isLoading: boolean
  onOpenRevisions: () => void
  onAddRevision: () => void
}) {
  if (isLoading && !revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr px-6 py-6 shadow-sm">
        <div className="h-5 w-40 skeleton rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-3/4 skeleton rounded" />
          <div className="h-4 w-1/2 skeleton rounded" />
        </div>
      </section>
    )
  }

  const currentEntry = revisionFamily?.chain.find(e => e.isCurrent) ?? null
  const currentJob = (() => {
    if (!revisionFamily || !currentEntry) return job.currentRevision ?? job
    if (currentEntry.isOriginal) return revisionFamily.original
    return revisionFamily.revisions.find(r => r.id === currentEntry.id) ?? job.currentRevision ?? job
  })()

  const label = currentEntry?.isOriginal || !currentEntry?.revisionLetter
    ? "Original"
    : `Rev ${currentEntry.revisionLetter}`
  const amendmentText = currentEntry?.isOriginal
    ? ""
    : (currentEntry?.notes?.trim() || "")
  const showReason = amendmentText.length > 0
  const fee = currentEntry?.isOriginal
    ? (revisionFamily?.original.quoteValue ?? job.quoteValue)
    : currentJob.quoteValue
  const completed = currentJob.dateCompleted
    ? format(parseLocalDate(currentJob.dateCompleted), "d MMM yyyy")
    : "—"

  return (
    <section className="rounded-xl border border-bd bg-sr px-6 py-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-[18px] w-[18px] text-t3 shrink-0" aria-hidden />
          <h2 className={cn(Typography.BodyLarge, "font-bold text-t1")}>
            Latest Revision ({label})
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {revisionFamily?.canAddRevision && (
            <Button variant="ghost" size="sm" onClick={onAddRevision}>
              Add
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onOpenRevisions}>
            View Revision
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      <div className={cn("grid gap-8", showReason ? "grid-cols-1 md:grid-cols-2 md:gap-12" : "grid-cols-1")}>
        <dl className="space-y-3">
          <Row label="Status" value={<StatusBadge status={currentJob.status} />} />
          <Row label="Completed" value={<span className="tabular-nums">{completed}</span>} />
          <Row label="Designer" value={currentJob.designer?.trim() || "Unassigned"} />
          <Row
            label="Fee"
            value={<span className="tabular-nums">{fee != null ? formatGBP(fee) : "—"}</span>}
          />
        </dl>

        {showReason && (
          <div>
            <p className={cn(Typography.Helper, "uppercase tracking-widest font-bold text-t3 mb-3")}>
              Reason for Revision
            </p>
            <div
              className={cn(
                Typography.Small,
                "bg-pg p-4 rounded-md min-h-[100px] italic text-t2 whitespace-pre-wrap",
              )}
            >
              &ldquo;{amendmentText}&rdquo;
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
