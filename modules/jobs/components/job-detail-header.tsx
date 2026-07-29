"use client"
import { format } from "date-fns"
import { ChevronDown, RotateCcw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/shared/ui/dropdown-menu"
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
  selectedRevisionId: string | null
  onSelectRevision: (id: string) => void
  onOpenRevisions: () => void
}

function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={cn(Typography.Helper, "uppercase tracking-[0.05em] text-t3 mb-1")}>{label}</p>
      <p className={cn(Typography.BodyLarge, "font-semibold text-t1 truncate")}>{value}</p>
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
  selectedRevisionId,
  onSelectRevision,
  onOpenRevisions,
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

  const chain = revisionFamily?.chain ?? []

  return (
    <header className="space-y-0">
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

      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div className="flex flex-wrap items-center gap-4 min-w-0">
          <h1
            className={cn(
              Typography.PageTitle,
              "font-mono tracking-tight text-t1",
              isCancelled && "line-through opacity-70",
            )}
          >
            {job.drawingNumber}
          </h1>
          <div className="flex items-center gap-2 border-l border-bd pl-4">
            {chain.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      Typography.Small,
                      "inline-flex items-center gap-2 px-3 py-1 border border-bd rounded-md font-medium text-t1",
                      "hover:bg-surface-low transition-colors",
                    )}
                    aria-label="Select revision"
                  >
                    <span>{currentRevisionLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-t3" aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {chain.map(entry => {
                    const label = entry.isOriginal
                      ? "Original"
                      : entry.revisionLetter
                        ? `Rev ${entry.revisionLetter}`
                        : entry.title
                    return (
                      <DropdownMenuItem
                        key={entry.id}
                        onSelect={() => {
                          onSelectRevision(entry.id)
                          onOpenRevisions()
                        }}
                      >
                        <span className={cn(selectedRevisionId === entry.id && "font-semibold")}>
                          {label}
                          {entry.isCurrent ? " · Current" : ""}
                        </span>
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span
                className={cn(
                  Typography.Small,
                  "inline-flex items-center px-3 py-1 border border-bd rounded-md font-medium text-t1",
                )}
              >
                {currentRevisionLabel}
              </span>
            )}
            <StatusBadge status={status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 border-y border-bd py-8 mb-8">
        <MetaItem
          label="Client"
          value={<span className={cn(isCancelled && "line-through opacity-70")}>{job.clientCompany}</span>}
        />
        <MetaItem label="Site" value={site} />
        <MetaItem label="Type of Works" value={works} />
      </div>
    </header>
  )
}
