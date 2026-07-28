"use client"
import { format } from "date-fns"
import { GitBranch, Plus, Receipt, UserCircle2 } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { formatGBP, cn } from "@/shared/utils/utils"
import type { DesignWorkItemRow } from "@/modules/jobs/types/design-work-item-types"
import { invoiceLabel } from "./parent-job-helpers"

interface ParentRevisionTimelineProps {
  sortedItems: DesignWorkItemRow[]
  current: DesignWorkItemRow | null
  isAdmin: boolean
  togglingId: string | null
  canAddRevision: boolean
  nextRevisionLetter: string | null
  onRevOpen: () => void
  onToggleBillable: (item: DesignWorkItemRow, next: boolean) => void
}

export function ParentRevisionTimeline({
  sortedItems,
  current,
  isAdmin,
  togglingId,
  canAddRevision,
  nextRevisionLetter,
  onRevOpen,
  onToggleBillable,
}: ParentRevisionTimelineProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-t1 inline-flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-ac" />
            Revision Timeline
          </h2>
          <p className="text-sm text-t3 mt-0.5">Original issue and revisions for this job</p>
        </div>
        <span className="text-sm text-t3 tabular-nums shrink-0">
          {sortedItems.length} work item{sortedItems.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative pl-8">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-bd" aria-hidden />
        <div className="space-y-6">
          {sortedItems.map(item => {
            const isCurrent = current?.id === item.id
            const isComplete = item.status === "ISSUED"
            const reason = item.description || item.notes

            return (
              <div key={item.id} className="relative">
                <div
                  className={cn(
                    "absolute -left-8 top-1.5 h-4 w-4 rounded-full border-[3px] border-sr z-10",
                    isCurrent
                      ? "bg-ac shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-ac)_25%,transparent)]"
                      : isComplete
                        ? "bg-ok-ic"
                        : "bg-t4",
                  )}
                  aria-hidden
                />
                <div
                  className={cn(
                    "rounded-xl border p-4",
                    isCurrent
                      ? "border-ac/40 bg-ac-bg/30"
                      : "border-bd bg-sr",
                    !isCurrent && isComplete && "opacity-80",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="type-body-lg text-t1">
                        {item.title}
                        {isCurrent ? " — In Progress" : isComplete ? " — Complete" : ""}
                      </h3>
                      <p className="text-sm text-t3 mt-0.5">
                        Created {format(new Date(item.dateCreated), "d MMM yyyy")}
                        {item.designer ? ` · ${item.designer}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-wrap gap-2 justify-end">
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-ac text-on-ac">
                          Active
                        </span>
                      )}
                      <StatusBadge status={item.status} />
                    </div>
                  </div>

                  {item.workType === "REVISION" && (
                    <blockquote className="text-base text-t2 leading-relaxed mb-3 border-l-2 border-bd pl-3">
                      {reason
                        ? `"${reason}"`
                        : <span className="italic text-t4">No reason recorded</span>}
                    </blockquote>
                  )}
                  {item.workType === "ORIGINAL" && reason && (
                    <p className="text-base text-t2 mb-3 whitespace-pre-wrap">{reason}</p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-t3 mb-2">
                    <p className="inline-flex items-center gap-1">
                      <UserCircle2 className="h-3.5 w-3.5" />
                      {item.designer || "Unassigned"}
                    </p>
                    <p className="inline-flex items-center gap-1">
                      <Receipt className="h-3.5 w-3.5" />
                      {invoiceLabel(item.invoiceStatus)}
                      {item.invoiceNumber ? ` · ${item.invoiceNumber}` : ""}
                    </p>
                    {(item.quoteValue != null || item.billedValue != null) && (
                      <p className="tabular-nums">
                        {item.billedValue != null
                          ? `Billed ${formatGBP(item.billedValue)}`
                          : `Quoted ${formatGBP(item.quoteValue)}`}
                      </p>
                    )}
                    {item.completedAt && (
                      <p>Completed {format(new Date(item.completedAt), "d MMM yyyy")}</p>
                    )}
                  </div>

                  {isAdmin && item.workType === "REVISION" && (
                    <label className="mt-1 inline-flex items-center gap-2 text-sm text-t2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.billable}
                        disabled={togglingId === item.id}
                        onChange={e => onToggleBillable(item, e.target.checked)}
                      />
                      Chargeable (Ready for Invoicing when Complete)
                    </label>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {canAddRevision && (
        <div className="mt-6 pt-4 border-t border-bd">
          <Button variant="outline" size="sm" onClick={onRevOpen}>
            <Plus className="h-3.5 w-3.5" />
            Add revision{nextRevisionLetter ? ` ${nextRevisionLetter}` : ""}
          </Button>
        </div>
      )}
    </div>
  )
}
