"use client"
import type { ElementType } from "react"
import { format } from "date-fns"
import {
  Pencil,
  RotateCcw,
  MapPin,
  CheckCircle2,
  CalendarDays,
  Clock,
  UserCircle2,
  FileText,
  GitBranch,
  Receipt,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { WorkItemTypeBadge } from "@/modules/jobs/components/badges/work-item-type-badge"
import { formatGBP, getJobDeadlineInfo, parseLocalDate, totalJobCommercialValue, cn } from "@/shared/utils/utils"
import type { Job, BillingHandoff } from "@/lib/types"
import { Pill } from "./job-page-primitives"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { getJobStatus, worksTypeDisplayLabel } from "@/lib/constants"

interface JobDetailHeaderProps {
  job: Job & { parentJob?: Job | null; billingHandoff?: BillingHandoff | null; currentRevision?: Job | null }
  isCancelled: boolean
  revLetter: string | null | undefined
  isAdmin: boolean
  restoring: boolean
  onRestore: () => void
  onEdit: () => void
  onAssign: () => void
  onDelete: () => void
  onEditDrawingNumber: () => void
  revisionFamily: RevisionFamilyResponse | null
  /** When set, header “Viewing” context reflects this revision row. */
  selectedRevisionId?: string | null
}

function SummaryStatCard({
  icon: Icon,
  label,
  value,
  badge,
}: {
  icon: ElementType
  label: string
  value: string
  badge?: string | null
}) {
  return (
    <div className="rounded-xl border border-bd bg-sr p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="rounded-full bg-pg border border-bd p-2.5 text-t4 inline-flex" aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        {badge ? (
          <span className="type-badge px-2 py-0.5 rounded-md bg-pg text-t2 border border-bd">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="text-lg font-semibold text-t1 tabular-nums font-mono truncate">{value}</p>
      <p className="text-xs text-t3 mt-1">{label}</p>
    </div>
  )
}

export function JobDetailHeader({
  job,
  isCancelled,
  revLetter,
  isAdmin,
  restoring,
  onRestore,
  onEdit: _onEdit,
  onAssign: _onAssign,
  onDelete: _onDelete,
  onEditDrawingNumber,
  revisionFamily,
  selectedRevisionId = null,
}: JobDetailHeaderProps) {
  const current = job.currentRevision ?? null

  const selectedJob: Job | null = (() => {
    if (!selectedRevisionId || !revisionFamily) return null
    if (revisionFamily.original.id === selectedRevisionId) return revisionFamily.original
    return revisionFamily.revisions.find(r => r.id === selectedRevisionId) ?? null
  })()

  const selectedEntry = revisionFamily?.chain.find(e => e.id === selectedRevisionId) ?? null
  const focusJob = selectedJob ?? current ?? job

  const currentStatus = focusJob.status
  const completedAt = focusJob.dateCompleted
  const designer = focusJob.designer?.trim() || "Unassigned"

  const viewingLetter = selectedEntry
    ? (selectedEntry.isOriginal ? null : selectedEntry.revisionLetter)
    : revLetter

  const revisionFees = revisionFamily
    ? revisionFamily.revisions.reduce((sum, r) => sum + (r.quoteValue ?? 0), 0)
    : null
  const originalBillable = totalJobCommercialValue(job) ?? 0
  const totalBillable = revisionFees == null ? null : originalBillable + revisionFees
  const totalRevisions = revisionFamily?.revisions.length ?? job.revisionCount ?? 0
  const originalQuote = job.quoteValue
  const deadlineIso = focusJob.requiredByDate ?? job.requiredByDate ?? null
  const focusDl = getJobDeadlineInfo({ ...job, ...focusJob, requiredByDate: deadlineIso })

  const location = [job.siteAddress ?? null, job.siteName ?? null].filter(Boolean).join(" · ") || job.address
  const statusLabel = getJobStatus(currentStatus).label

  const cancelSubtitle = job.cancelRecord
    ? [
        job.cancelRecord.performedByName,
        job.cancelRecord.reason ? `— ${job.cancelRecord.reason}` : "",
      ].filter(Boolean).join(" ")
    : null

  return (
    <>
      {isCancelled && (
        <div className="mb-6 rounded-xl border border-dn-bd bg-dn-bg px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dn-tx flex items-center gap-2 flex-wrap">
                <span className="type-badge px-2 py-0.5 rounded-full bg-dn-bg border border-dn-bd">
                  Cancelled
                </span>
                <span className="font-mono line-through opacity-80">{job.drawingNumber}</span>
              </p>
              <p className="text-xs text-dn-tx/90 mt-1">
                Cancelled{" "}
                {job.archivedAt
                  ? format(new Date(job.archivedAt), "d MMM yyyy 'at' HH:mm")
                  : "—"}
                {cancelSubtitle ? ` by ${cancelSubtitle}` : ""}
              </p>
              <p className="text-xs text-t3 mt-1">
                This drawing number stays on record and will not be reused.
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" loading={restoring} onClick={onRestore}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore job
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Master job card */}
      <section className="oryx-surface-card overflow-hidden rounded-xl border border-bd bg-sr p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={currentStatus} />
              <span className="font-mono text-base text-t3 tabular-nums">{job.drawingNumber}</span>
              <span className="type-badge px-3 py-1 rounded-full bg-pg text-t2 border border-bd">
                ORIGINAL JOB
              </span>
              {viewingLetter
                ? <Pill tone="ac">Viewing Rev {viewingLetter}</Pill>
                : <Pill tone="neutral">Viewing Original</Pill>}
            </div>

            <p className="text-sm text-t3">
              <span className="font-semibold text-t1">Original Project:</span>{" "}
              <span className="font-mono tabular-nums">{job.drawingNumber}</span>
              {revLetter ? (
                <>
                  {" "}·{" "}
                  <span className="font-semibold text-t1">
                    Current Revision: Rev {revLetter}
                  </span>
                </>
              ) : null}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-3 pt-1">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-t3">Client</span>
                <span className={cn(
                  "text-base font-semibold text-t1 truncate",
                  isCancelled && "line-through opacity-70",
                )}>
                  {job.clientCompany}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-t3">Location</span>
                <span className="text-base text-t2 flex items-start gap-2 min-w-0">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-t4" />
                  <span className="truncate">{location}</span>
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-t3">Designer</span>
                <span className="text-base font-semibold text-t1 truncate">{designer}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-t3">Job Type</span>
                <span className="text-base text-t2 flex items-center gap-2">
                  <WorkItemTypeBadge itemType={job.itemType ?? "DESIGN"} />
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-t3">Type of Works</span>
                <span className="text-base text-t2 font-medium">
                  {worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || <span className="text-t4 italic">Not set</span>}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3 lg:self-center">
            <div className="flex flex-wrap gap-2 items-center">
              {focusDl.severity !== "none" && (
                <Pill tone={focusDl.severity === "overdue" ? "dn" : "neutral"}>
                  {focusDl.label}
                </Pill>
              )}
              {isAdmin && !isCancelled && (
                <button
                  onClick={onEditDrawingNumber}
                  className="text-t4 hover:text-ac rounded-md p-1 transition-colors"
                  title="Edit drawing number"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>

            {isCancelled && isAdmin ? (
              <Button variant="outline" size="sm" loading={restoring} onClick={onRestore}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore job
              </Button>
            ) : null}
          </div>
        </div>

        {(job.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-6 pb-6 border-b border-bd">
            {(job.tags ?? []).map(tag => (
              <Pill key={tag} tone="neutral">{tag}</Pill>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-2 border-t border-bd">
          <SummaryStatCard icon={CheckCircle2} label="Status" value={statusLabel} />
          <SummaryStatCard
            icon={CalendarDays}
            label="Completed"
            value={completedAt ? format(parseLocalDate(completedAt), "d MMM yyyy") : "—"}
          />
          <SummaryStatCard
            icon={Clock}
            label="Deadline"
            value={deadlineIso ? format(parseLocalDate(deadlineIso), "d MMM yyyy") : "—"}
            badge={focusDl.severity === "overdue" ? "Due" : focusDl.severity === "today" ? "Today" : null}
          />
          <SummaryStatCard icon={UserCircle2} label="Designer" value={designer} />
          <SummaryStatCard icon={FileText} label="Original Quote" value={originalQuote != null ? formatGBP(originalQuote) ?? "—" : "—"} />
          <SummaryStatCard
            icon={GitBranch}
            label="Revision Fees"
            value={revisionFees == null ? "—" : formatGBP(revisionFees)}
          />
          <SummaryStatCard
            icon={Receipt}
            label="Total Billable"
            value={totalBillable == null ? "—" : formatGBP(totalBillable)}
          />
          <SummaryStatCard icon={GitBranch} label="Total Revisions" value={String(totalRevisions)} />
        </div>
      </section>
    </>
  )
}
