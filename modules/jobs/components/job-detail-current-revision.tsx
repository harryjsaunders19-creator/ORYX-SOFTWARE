"use client"
import { format } from "date-fns"
import { FileText } from "lucide-react"
import { cn, formatGBP, parseLocalDate } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

export function JobDetailCurrentRevision({
  job,
  revisionFamily,
  isLoading,
}: {
  job: Job & { currentRevision?: Job | null }
  revisionFamily: RevisionFamilyResponse | null
  isLoading: boolean
}) {
  if (isLoading && !revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr px-8 py-8 shadow-sm w-full">
        <div className="h-5 w-40 skeleton rounded mb-4" />
        <div className="space-y-2">
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-3/4 skeleton rounded" />
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
    : `Revision ${currentEntry.revisionLetter}`
  const amendmentText = currentEntry?.isOriginal
    ? ""
    : (currentEntry?.notes?.trim() || "")
  const showAmendments = amendmentText.length > 0
  const fee = currentEntry?.isOriginal
    ? (revisionFamily?.original.quoteValue ?? job.quoteValue)
    : currentJob.quoteValue
  const completed = currentJob.dateCompleted
    ? format(parseLocalDate(currentJob.dateCompleted), "d MMM yyyy")
    : "—"

  return (
    <section className="rounded-xl border border-bd bg-sr px-6 sm:px-8 py-6 sm:py-8 shadow-sm w-full ring-1 ring-black/5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-md bg-surface-low flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-t1" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 leading-none mb-1")}>
              Current Version
            </p>
            <h2 className={cn(Typography.CardTitle, "font-bold text-t1")}>{label}</h2>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-8 sm:gap-12",
          showAmendments ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
        )}
      >
        <div>
          <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 mb-2")}>
            Completed Date
          </p>
          <p className={cn(Typography.BodyLarge, "font-bold text-t1 tabular-nums")}>{completed}</p>
        </div>
        <div>
          <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 mb-2")}>Fee</p>
          <p className={cn(Typography.BodyLarge, "font-bold text-t1 tabular-nums")}>
            {fee != null ? formatGBP(fee) : "—"}
          </p>
        </div>
        {showAmendments && (
          <div>
            <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 mb-2")}>
              Amendments
            </p>
            <div
              className={cn(
                Typography.Small,
                "font-medium italic text-t2 border-l-2 border-bd pl-4 py-1 whitespace-pre-wrap",
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
