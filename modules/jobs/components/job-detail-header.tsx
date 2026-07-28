"use client"
import { format } from "date-fns"
import { Pencil, UserPlus, Trash2, RotateCcw, MapPin } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { WorkItemTypeBadge } from "@/modules/jobs/components/badges/work-item-type-badge"
import { formatGBP, getJobDeadlineInfo, parseLocalDate, totalJobCommercialValue, cn } from "@/shared/utils/utils"
import type { Job, BillingHandoff } from "@/lib/types"
import { KpiCard, Pill } from "./job-page-primitives"

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
}

export function JobDetailHeader({
  job,
  isCancelled,
  revLetter,
  isAdmin,
  restoring,
  onRestore,
  onEdit,
  onAssign,
  onDelete,
  onEditDrawingNumber,
}: JobDetailHeaderProps) {
  const dl = getJobDeadlineInfo(job)
  const commercialTotal = totalJobCommercialValue(job)

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

      {/* Master job card — Stitch layout */}
      <section className="oryx-surface-card mb-8 overflow-hidden rounded-xl border border-bd bg-sr p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={job.status} />
              <span className="font-mono text-base text-t3 tabular-nums">{job.drawingNumber}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={cn(
                "oryx-page-title text-t1",
                isCancelled && "line-through opacity-70",
              )}>
                {job.clientCompany}
              </h1>
              {isAdmin && !isCancelled && (
                <button
                  onClick={onEditDrawingNumber}
                  className="text-t4 hover:text-ac"
                  title="Edit drawing number"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {job.address && (
              <p className="text-base text-t2 flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-1 shrink-0" />
                <span>{job.address}</span>
              </p>
            )}
            <p className="text-sm text-t3 pt-1">
              Workflow actions apply to{" "}
              <span className="font-semibold text-t1">
                Current Revision: {revLetter ? `Rev ${revLetter}` : "Original"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:self-start">
            <div className="flex flex-wrap gap-2">
              <WorkItemTypeBadge itemType={job.itemType ?? "DESIGN"} />
              {revLetter && <Pill tone="ac">Revision {revLetter}</Pill>}
              {!revLetter && (job.itemType === "DESIGN" || !job.itemType) && (
                <Pill tone="neutral">Original Issue</Pill>
              )}
              {dl.severity !== "none" && (
                <Pill tone={dl.severity === "overdue" ? "dn" : "neutral"}>
                  {dl.label}
                </Pill>
              )}
            </div>
            {!isCancelled ? (
              <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                <Button variant={job.designer ? "outline" : "primary"} size="sm" onClick={onAssign}>
                  <UserPlus className="h-3.5 w-3.5" />
                  {job.designer ? "Change designer" : "Assign designer"}
                </Button>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {isAdmin && (
                  <Button variant="ghost" size="icon-sm" onClick={onDelete} title="Cancel job">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ) : isAdmin ? (
              <Button variant="outline" size="sm" loading={restoring} onClick={onRestore}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            ) : null}
          </div>
        </div>

        {(job.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-bd">
            {(job.tags ?? []).map(tag => (
              <Pill key={tag} tone="neutral">{tag}</Pill>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 border-t border-bd">
          <KpiCard variant="bare" label="Current Revision" value={revLetter ? `Rev ${revLetter}` : "Original"} />
          <KpiCard variant="bare" label="Active Designer" value={job.designer?.trim() || "Unassigned"} />
          <KpiCard variant="bare" label="Total Revisions" value={job.revisionCount != null ? String(job.revisionCount) : "—"} />
          <KpiCard variant="bare" label="Quote / Agreed" value={formatGBP(commercialTotal) ?? "—"} />
          <KpiCard
            variant="bare"
            label="Deadline"
            value={job.requiredByDate ? format(parseLocalDate(job.requiredByDate), "d MMM yyyy") : "—"}
            badge={dl.severity === "overdue" ? "Due" : dl.severity === "today" ? "Today" : null}
          />
        </div>
      </section>
    </>
  )
}
