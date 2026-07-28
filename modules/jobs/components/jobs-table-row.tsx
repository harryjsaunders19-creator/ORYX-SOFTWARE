"use client"
import { memo } from "react"
import {
  Plus, Pencil, Trash2,
  FolderOpen, ArrowUp, ArrowDown, ArrowUpDown, GitBranch, AlertTriangle, Clock,
  MoreHorizontal, Building2, FileText, UserCircle2, PenTool,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu"
import { JOB_ROW_BG, JOB_ROW_BORDER } from "@/components/status-badge"
import { WorkItemTypeBadge } from "@/components/work-item-type-badge"
import { TypeOfWorksBadge } from "@/components/type-of-works-badge"
import { InlineStatusSelect, InlineDesignerSelect } from "@/components/inline-edit-selects"
import { cn, formatGBP, getJobDeadlineInfo, totalJobCommercialValue } from "@/shared/utils/utils"
import { EmptyPanel } from "@/shared/layouts/page-layout"
import { RevisionFamilyBadge } from "@/components/revision-family-badge"
import type { Job, SortField, SortDir } from "@/lib/types"
import {
  COL_TYPE_OF_WORKS,
  COL_CLIENT,
  COL_REQUESTED_BY,
  COL_QUOTATION,
  COL_DESIGNER,
} from "./jobs-table-columns"

export {
  COL_TYPE_OF_WORKS,
  COL_CLIENT,
  COL_REQUESTED_BY,
  COL_QUOTATION,
  COL_DESIGNER,
} from "./jobs-table-columns"

export function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-bd">
          {[110, 200, 130, 130, 120, 90, 130, 110].map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="skeleton h-4" style={{ width: w }} />
            </td>
          ))}
          <td className="px-4 py-3.5 w-16" />
        </tr>
      ))}
    </>
  )
}

export function EmptyState({ hasFilters, onCreate, onClear }: {
  hasFilters: boolean; onCreate: () => void; onClear: () => void
}) {
  return (
    <tr>
      <td colSpan={9} className="p-0">
        <EmptyPanel
          icon={FolderOpen}
          title={hasFilters ? "No jobs match" : "No jobs yet"}
          description={hasFilters ? "Try clearing your filters" : "Create your first job to get started"}
          action={hasFilters
            ? <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>
            : <Button variant="primary" size="sm" onClick={onCreate}><Plus className="h-3.5 w-3.5" />New job</Button>
          }
        />
      </td>
    </tr>
  )
}

export function SortTh({ field, label, current, dir, onSort, className }: {
  field: SortField; label: string; current: SortField; dir: SortDir
  onSort: (f: SortField) => void; className?: string
}) {
  const active = current === field
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        "px-4 py-2.5 text-left type-label text-t3 cursor-pointer select-none whitespace-nowrap",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 text-t2" /> : <ArrowDown className="h-3.5 w-3.5 text-t2" />
          : <ArrowUpDown className="h-3.5 w-3.5 text-t4" />}
      </span>
    </th>
  )
}

export const JobMobileCard = memo(function JobMobileCard({
  job,
  isOnHold,
  showTags,
  onOpen,
  onStatusChange,
}: {
  job: Job
  isOnHold: boolean
  /** Tags clutter the default list — only show while searching. */
  showTags: boolean
  // Perf: stable callbacks from parent so memo skips re-render when filters change.
  onOpen: (jobId: string) => void
  onStatusChange: (job: Job, status: string) => void
}) {
  const dl = getJobDeadlineInfo(job)
  const showDeadline = dl.severity !== "none"
  const total = totalJobCommercialValue(job)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job.id)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpen(job.id) }}
      className={cn(
        "rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5 cursor-pointer active:scale-[0.99] transition-transform",
        JOB_ROW_BG[job.status] ?? "",
        JOB_ROW_BORDER[job.status] ?? "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <RevisionFamilyBadge job={job} />
            <span className="font-mono type-badge text-ac">{job.drawingNumber}</span>
            {job.itemType && job.itemType !== "DESIGN" && job.itemType !== "REVISION" && (
              <WorkItemTypeBadge itemType={job.itemType} size="sm" />
            )}
            {showTags && (job.tags ?? []).slice(0, 2).map(tag => (
              <span key={tag} className="type-helper px-1.5 py-0.5 rounded border border-bd text-t3 font-medium">
                {tag}
              </span>
            ))}
            {showTags && (job.tags ?? []).length > 2 && (
              <span className="type-helper text-t4">+{(job.tags ?? []).length - 2}</span>
            )}
          </div>
          <p className="text-sm font-medium text-t1 mt-1 line-clamp-2">{job.address}</p>
          <p className="text-xs text-t3 mt-0.5 truncate">{job.clientCompany}</p>
        </div>
        {isOnHold && (
          <AlertTriangle className="h-4 w-4 text-dn shrink-0" aria-label="Client on hold" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
        <InlineStatusSelect status={job.status} onChange={value => onStatusChange(job, value)} size="lg" />
        {showDeadline && (
          <span className={cn(
            "inline-flex items-center gap-1 type-badge px-2 py-1 rounded-full border",
            dl.severity === "overdue" ? "bg-dn-bg text-dn-tx border-dn-bd"
              : dl.severity === "today" ? "bg-wn-bg text-wn-tx border-wn-bd"
              : "bg-wn-bg/60 text-wn-tx border-wn-bd/60",
          )}>
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {dl.label}
          </span>
        )}
      </div>

      {(total != null || job.designer) && (
        <div className="flex items-center justify-between gap-2 text-xs text-t3 pt-0.5 border-t border-bd/60">
          {total != null && (
            <span className="tabular-nums font-medium text-t2">{formatGBP(total)}</span>
          )}
          {job.designer && (
            <span className="truncate">{job.designer}</span>
          )}
        </div>
      )}
    </div>
  )
})

export type JobWithRevision = Job & { canAddRevision?: boolean }

export interface JobTableRowProps {
  job:                  JobWithRevision
  isOnHold:             boolean
  designers:            string[]
  isAdmin:              boolean
  creatingRevisionFor:  string | null
  /** Tags clutter the default list — only show while searching. */
  showTags:             boolean
  onPatchField:         (job: JobWithRevision, field: "status" | "designer", value: string) => void
  onEdit:               (job: JobWithRevision) => void
  onDelete:             (job: JobWithRevision) => void
  onQuickRevision:      (job: JobWithRevision) => void
  onNavigate:           (path: string) => void
}

// Memoized desktop table row. Re-renders only when the job data itself changes
// (e.g. after an inline status/designer edit), not when parent state like
// search filters or page number changes.
export const JobTableRow = memo(
  function JobTableRow({
    job, isOnHold, designers, isAdmin, creatingRevisionFor, showTags,
    onPatchField, onEdit, onDelete, onQuickRevision, onNavigate,
  }: JobTableRowProps) {
    const dl = getJobDeadlineInfo(job)
    const showDeadlineFlag = dl.severity === "overdue" || dl.severity === "today" || dl.severity === "soon"

    return (
      <tr
        onClick={() => onNavigate(`/jobs/${job.id}`)}
        className={cn(
          "border-b border-bd last:border-0 cursor-pointer group",
          JOB_ROW_BG[job.status] ?? "",
          JOB_ROW_BORDER[job.status] ?? "",
          "hover:brightness-[0.98]",
        )}
      >
        <td className="px-4 py-3.5 whitespace-nowrap">
          <span className="flex items-center gap-1.5 flex-wrap">
            <RevisionFamilyBadge job={job} />
            <span className="font-mono type-badge text-ac">{job.drawingNumber}</span>
            {job.itemType && job.itemType !== "DESIGN" && job.itemType !== "REVISION" && (
              <WorkItemTypeBadge itemType={job.itemType} size="sm" />
            )}
            {showTags && (job.tags ?? []).slice(0, 2).map(tag => (
              <span key={tag} className="type-helper px-1.5 py-0.5 rounded border border-bd text-t3 font-medium">
                {tag}
              </span>
            ))}
            {showTags && (job.tags ?? []).length > 2 && (
              <span className="type-helper text-t4">+{(job.tags ?? []).length - 2}</span>
            )}
          </span>
        </td>

        <td className="px-4 py-3.5 max-w-[220px]">
          <p className="text-sm font-medium text-t1 truncate" title={job.address}>{job.address}</p>
        </td>

        <td className={cn("px-4 py-3.5 whitespace-nowrap", COL_TYPE_OF_WORKS)}>
          <TypeOfWorksBadge typeOfWorks={job.typeOfWorks} customTypeDescription={job.customTypeDescription} size="sm" />
        </td>

        <td className={cn("px-4 py-3.5 max-w-[170px]", COL_CLIENT)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            {isOnHold && (
              <span title="Client on hold"><AlertTriangle className="h-3.5 w-3.5 text-dn shrink-0" /></span>
            )}
            <p className="text-xs font-medium text-t1 truncate">{job.clientCompany}</p>
            {isOnHold && (
              <span className="type-badge px-2 py-0.5 rounded-full bg-dn-bg text-dn-tx whitespace-nowrap">
                On Hold
              </span>
            )}
          </div>
        </td>

        <td className={cn("px-4 py-3.5 max-w-[150px]", COL_REQUESTED_BY)}>
          <p className="text-xs text-t3 truncate flex items-center gap-1.5">
            <UserCircle2 className="h-3.5 w-3.5 text-t4 shrink-0" />
            {job.requestedBy || <span className="italic text-t4">—</span>}
          </p>
        </td>

        <td className={cn("px-4 py-3.5 whitespace-nowrap text-right", COL_QUOTATION)}>
          <p className="text-xs tabular-nums font-medium text-t2">
            {totalJobCommercialValue(job) != null
              ? formatGBP(totalJobCommercialValue(job))
              : job.quoteValue != null
                ? formatGBP(job.quoteValue)
                : <span className="text-t4">—</span>}
          </p>
          {(job.variationFees != null || job.additionalCharges != null) && job.quoteValue != null && (
            <p className="type-helper text-t4 tabular-nums">incl. extras</p>
          )}
          {job.quoteReference && (
            <p className="type-helper font-mono text-t4 tabular-nums">{job.quoteReference}</p>
          )}
        </td>

        <td className="px-4 py-3.5 whitespace-nowrap min-w-[148px]" onClick={e => e.stopPropagation()}>
          <InlineStatusSelect
            status={job.status}
            onChange={value => onPatchField(job, "status", value)}
            size="lg"
          />
          {showDeadlineFlag && (
            <p className={cn(
              "mt-1 inline-flex items-center gap-1 type-badge",
              dl.severity === "overdue" ? "text-dn-tx" : "text-wn-tx",
            )}>
              {dl.severity === "overdue" && <Clock className="h-2.5 w-2.5 shrink-0" />}
              {dl.label}
            </p>
          )}
        </td>

        <td className={cn("px-4 py-3.5 whitespace-nowrap", COL_DESIGNER)} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <PenTool className="h-3.5 w-3.5 text-t4 shrink-0" />
            <InlineDesignerSelect
              designer={job.designer}
              designers={designers}
              onChange={value => onPatchField(job, "designer", value)}
            />
          </div>
        </td>

        <td className="px-3 py-3.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            {job.canAddRevision && (
              <Button
                variant="outline"
                size="sm"
                loading={creatingRevisionFor === job.id}
                onClick={() => onQuickRevision(job)}
                title="Create the next revision in this chain"
                className="shrink-0"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Add revision
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "h-7 w-7 rounded flex items-center justify-center text-t4 hover:text-t2 hover:bg-pg",
                    "invisible group-hover:visible data-[state=open]:visible data-[state=open]:bg-pg data-[state=open]:text-t2",
                  )}
                  title="Quick actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(job)}>
                  <Pencil className="h-3.5 w-3.5 text-t4" /> Edit job
                </DropdownMenuItem>
                {job.clientId && (
                  <DropdownMenuItem onSelect={() => onNavigate(`/clients/${job.clientId}`)}>
                    <Building2 className="h-3.5 w-3.5 text-t4" /> View client
                  </DropdownMenuItem>
                )}
                {job.quoteReference && (
                  <DropdownMenuItem onSelect={() => onNavigate(`/quotes?search=${encodeURIComponent(job.quoteReference!)}`)}>
                    <FileText className="h-3.5 w-3.5 text-t4" /> Open quote
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger onSelect={() => onDelete(job)}>
                      <Trash2 className="h-3.5 w-3.5" /> Cancel job
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>
    )
  },
  // Custom comparator: skip re-render unless the job data or display-critical
  // props change. Callbacks are intentionally excluded — they can be stale
  // without causing data corruption because patchJobField uses functional state
  // updates and refresh is idempotent.
  (prev, next) =>
    prev.job === next.job &&
    prev.isOnHold === next.isOnHold &&
    prev.creatingRevisionFor === next.creatingRevisionFor &&
    prev.designers === next.designers &&
    prev.isAdmin === next.isAdmin &&
    prev.showTags === next.showTags,
)
