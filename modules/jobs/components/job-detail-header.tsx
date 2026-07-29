"use client"
import { format } from "date-fns"
import { RotateCcw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { getJobDeadlineInfo, parseLocalDate, cn } from "@/shared/utils/utils"
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

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-t4 mb-1">{label}</p>
      <p className="text-sm text-t1 truncate">{value}</p>
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
  const designer = focus.designer?.trim() || "Unassigned"
  const dl = getJobDeadlineInfo({ requiredByDate: focus.requiredByDate ?? job.requiredByDate, status })
  const revLetter = currentEntry?.isOriginal
    ? null
    : (currentEntry?.revisionLetter ?? job.currentRevisionLetter ?? job.revisionLetter)
  const currentRevisionLabel = revLetter ? `Rev ${revLetter}` : "Original"
  const site = [job.siteAddress, job.siteName].filter(Boolean).join(" · ") || job.address || "—"
  const works = worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || "—"
  const deadlineValue = (focus.requiredByDate ?? job.requiredByDate)
    ? format(parseLocalDate((focus.requiredByDate ?? job.requiredByDate)!), "d MMM yyyy")
    : "—"

  return (
    <header className="space-y-4">
      {isCancelled && (
        <div className="rounded-lg border border-dn-bd bg-dn-bg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-dn-tx">Cancelled</p>
            <p className="text-xs text-dn-tx/80 mt-0.5">
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

      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
        <div className="min-w-0 space-y-4">
          <h1
            className={cn(
              "text-3xl font-semibold tracking-tight text-t1 font-mono",
              isCancelled && "line-through opacity-70",
            )}
          >
            {job.drawingNumber}
          </h1>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 max-w-3xl">
            <MetaItem
              label="Client"
              value={<span className={cn(isCancelled && "line-through opacity-70")}>{job.clientCompany}</span>}
            />
            <MetaItem label="Site" value={site} />
            <MetaItem label="Type of Works" value={works} />
            <MetaItem label="Current Revision" value={currentRevisionLabel} />
          </div>
        </div>

        <div className="flex flex-wrap xl:flex-col xl:items-end gap-3 xl:gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
          </div>
          <div className="text-right space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-t4">Deadline</p>
            <p className={cn(
              "text-sm font-medium tabular-nums",
              dl.severity === "overdue" ? "text-dn-tx" : dl.severity === "today" || dl.severity === "soon" ? "text-wn-tx" : "text-t1",
            )}>
              {deadlineValue}
              {dl.severity !== "none" && dl.severity !== "normal" ? (
                <span className="ml-2 text-xs font-normal">({dl.label})</span>
              ) : null}
            </p>
          </div>
          <div className="text-right space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-t4">Designer</p>
            <p className="text-sm font-medium text-t1">{designer}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
