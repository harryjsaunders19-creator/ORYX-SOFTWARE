"use client"
import type { ReactNode } from "react"
import { format } from "date-fns"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { formatGBP, parseLocalDate } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-[#E5E7EB] last:border-0">
      <dt className="text-sm text-t3 shrink-0 w-36">{label}</dt>
      <dd className="text-sm text-t1 text-right min-w-0">{value}</dd>
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
      <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
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
  const amendments = currentEntry?.isOriginal
    ? "—"
    : (currentEntry?.notes?.trim() || "—")
  const fee = currentEntry?.isOriginal
    ? (revisionFamily?.original.quoteValue ?? job.quoteValue)
    : currentJob.quoteValue
  const completed = currentJob.dateCompleted
    ? format(parseLocalDate(currentJob.dateCompleted), "d MMM yyyy")
    : "—"

  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-t1">Current revision</h2>
        <div className="flex items-center gap-2">
          {revisionFamily?.canAddRevision && (
            <Button variant="ghost" size="sm" onClick={onAddRevision}>
              Add
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onOpenRevisions}>
            Open revision
          </Button>
        </div>
      </div>

      <dl>
        <Row label="Revision" value={<span className="font-medium">{label}</span>} />
        <Row label="Status" value={<StatusBadge status={currentJob.status} />} />
        <Row label="Completed" value={<span className="tabular-nums">{completed}</span>} />
        <Row label="Designer" value={currentJob.designer?.trim() || "—"} />
        <Row label="Fee" value={<span className="tabular-nums">{fee != null ? formatGBP(fee) : "—"}</span>} />
        <Row
          label="Amendments"
          value={
            <span className="whitespace-pre-wrap text-left block max-w-md ml-auto">
              {amendments}
            </span>
          }
        />
      </dl>
    </section>
  )
}
