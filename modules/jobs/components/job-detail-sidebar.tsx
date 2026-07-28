"use client"
import { format } from "date-fns"
import { AlertOctagon, Clock, Download, Pencil, Trash2, UserPlus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { cn, parseLocalDate } from "@/shared/utils/utils"
import type { DeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"

interface JobDetailSidebarProps {
  job: Job & { currentRevision?: Job | null }
  dl: DeadlineInfo
  isCancelled: boolean
  isAdmin: boolean
  cat2Exporting: boolean
  onAssign: () => void
  onEdit: () => void
  onCat2Export: () => void
  onDelete: () => void
}

export function JobDetailSidebar({
  job,
  dl,
  isCancelled,
  isAdmin,
  cat2Exporting,
  onAssign,
  onEdit,
  onCat2Export,
  onDelete,
}: JobDetailSidebarProps) {
  return (
    <div className="lg:col-span-3 space-y-6">
      {job.requiredByDate && job.status !== "ISSUED" && (
        <div className={cn(
          "rounded-xl border p-4",
          dl.severity === "overdue" ? "bg-dn-bg border-dn-bd"
            : dl.severity === "today" ? "bg-wn-bg border-wn-bd"
            : dl.severity === "soon" ? "bg-wn-bg/60 border-wn-bd/60"
            : "bg-sr border-bd",
        )}>
          <div className="flex items-center gap-2 mb-2">
            {dl.severity === "overdue"
              ? <AlertOctagon className="h-4 w-4 text-dn shrink-0" />
              : <Clock className="h-4 w-4 text-t4 shrink-0" />}
            <p className="type-label text-t3">Deadline</p>
          </div>
          <p className={cn(
            "text-sm font-semibold tabular-nums",
            dl.severity === "overdue" || dl.severity === "today" || dl.severity === "soon"
              ? (dl.severity === "overdue" ? "text-dn-tx" : "text-wn-tx")
              : "text-t1",
          )}>
            {dl.label}
          </p>
          <p className="text-xs text-t3 mt-0.5">
            {format(parseLocalDate(job.requiredByDate), "d MMM yyyy")}
          </p>
        </div>
      )}

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-4">Actions</h2>
        {isCancelled ? (
          <p className="text-xs text-t3">
            This job is cancelled. Restore it to make changes or return it to active views.
          </p>
        ) : (
          <div className="space-y-2">
            <Button
              variant={job.designer ? "outline" : "primary"}
              size="sm"
              className="w-full justify-start"
              onClick={onAssign}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {job.designer ? "Change designer" : "Assign designer"}
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit details
            </Button>
            {(job.status === "ISSUED" || job.currentRevision?.status === "ISSUED") && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={onCat2Export}
                loading={cat2Exporting}
              >
                <Download className="h-3.5 w-3.5" /> Export CAT II Check Sheet
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-dn hover:bg-dn-bg"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" /> Cancel job
              </Button>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-bd bg-sr p-6">
        <h2 className="text-base font-semibold text-t1 mb-3">Dates</h2>
        <dl className="space-y-2">
          {([
            ["Created", format(new Date(job.dateCreated), "d MMM yyyy")],
            ...(job.dateCompleted
              ? [["Completed", format(parseLocalDate(job.dateCompleted), "d MMM yyyy")] as [string, string]]
              : []),
            ["Updated", format(new Date(job.updatedAt), "d MMM yyyy")],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex justify-between text-xs">
              <dt className="text-t3">{l}</dt>
              <dd className="font-medium text-t1 tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

    </div>
  )
}
