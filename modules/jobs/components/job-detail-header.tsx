"use client"
import { format } from "date-fns"
import { RotateCcw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { worksTypeDisplayLabel } from "@/lib/constants"
import type { ReactNode } from "react"

interface JobDetailHeaderProps {
  job: Job & { currentRevision?: Job | null }
  isCancelled: boolean
  isAdmin: boolean
  restoring: boolean
  onRestore: () => void
  revisionFamily: RevisionFamilyResponse | null
}

function InlineMeta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={cn(Typography.Helper, "uppercase tracking-widest text-t4 shrink-0")}>
        {label}
      </span>
      <span className={cn(Typography.Small, "font-medium text-t1 truncate")}>{value}</span>
    </div>
  )
}

export function JobDetailHeader({
  job,
  isCancelled,
  isAdmin,
  restoring,
  onRestore,
  revisionFamily,
}: JobDetailHeaderProps) {
  const current = job.currentRevision ?? null
  const currentEntry = revisionFamily?.chain.find(e => e.isCurrent) ?? null
  const focus = current ?? job
  const status = focus.status
  const revLetter = currentEntry?.isOriginal
    ? null
    : (currentEntry?.revisionLetter ?? job.currentRevisionLetter ?? job.revisionLetter)
  const currentRevisionLabel = revLetter ? `Rev ${revLetter}` : "Original"
  const site = [job.siteAddress, job.siteName].filter(Boolean).join(" · ") || job.address || "—"
  const works = worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || "—"

  return (
    <header className="mb-2">
      {isCancelled && (
        <div className="rounded-lg border border-dn-bd bg-dn-bg px-4 py-3 flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="min-w-0">
            <p className={cn(Typography.Small, "font-medium text-dn-tx")}>Cancelled</p>
            <p className={cn(Typography.Helper, "text-dn-tx/80 mt-0.5")}>
              {job.archivedAt ? format(new Date(job.archivedAt), "d MMM yyyy") : "—"}
              {job.cancelRecord?.performedByName ? ` · ${job.cancelRecord.performedByName}` : ""}
              {job.cancelRecord?.reason ? ` — ${job.cancelRecord.reason}` : ""}
            </p>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" loading={restoring} onClick={onRestore}>
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 mb-2">
        <h1
          className={cn(
            Typography.PageTitle,
            "type-drawing-number tracking-tight text-t1",
            isCancelled && "line-through opacity-70",
          )}
        >
          {job.drawingNumber}
        </h1>
        <div className="flex items-center gap-3 border-l border-bd pl-4">
          <span
            className={cn(
              Typography.Small,
              "font-bold bg-surface-low px-2 py-1 rounded-md text-t1",
            )}
          >
            {currentRevisionLabel}
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <InlineMeta
          label="Client"
          value={<span className={cn(isCancelled && "line-through opacity-70")}>{job.clientCompany}</span>}
        />
        <InlineMeta label="Site" value={site} />
        <InlineMeta label="Works" value={works} />
      </div>
    </header>
  )
}
