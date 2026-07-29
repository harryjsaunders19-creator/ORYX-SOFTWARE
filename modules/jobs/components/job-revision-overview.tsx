"use client"
import { format } from "date-fns"
import { ArrowRight, Clock, Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { cn, formatGBP, parseLocalDate } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

export function JobRevisionOverview({
  job: _job,
  revisionFamily,
  isLoading,
  selectedRevisionId,
  onSelectedRevisionId,
  onAddRevision,
  defaultExpanded = false,
  preview = false,
  /** When preview is true, collapse to the first 3 rows until View all. */
  collapsed = true,
  onViewAll,
}: {
  job: Job
  revisionFamily: RevisionFamilyResponse | null
  isLoading: boolean
  selectedRevisionId: string | null
  onSelectedRevisionId: (id: string | null) => void
  onAddRevision: () => void
  defaultExpanded?: boolean
  preview?: boolean
  collapsed?: boolean
  onViewAll?: () => void
}) {
  if (isLoading && !revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr px-5 py-4 w-full">
        <div className="h-5 w-40 skeleton rounded" />
      </section>
    )
  }

  if (!revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr px-5 py-4 w-full">
        <p className={cn(Typography.Small, "text-t4")}>Revision history unavailable.</p>
      </section>
    )
  }

  const originalJob = revisionFamily.original
  const originalEntry = revisionFamily.chain.find(e => e.isOriginal) ?? null
  const revisionEntries = revisionFamily.chain.filter(e => !e.isOriginal)
  const revisionById = new Map(revisionFamily.revisions.map(r => [r.id, r]))

  const rows: Array<{
    id: string
    label: string
    status: string
    completed: string
    amendments: string
    fee: string
    designer: string
    isCurrent: boolean
  }> = [
    {
      id: originalJob.id,
      label: "Original",
      status: originalEntry?.status ?? originalJob.status,
      completed: originalJob.dateCompleted
        ? format(parseLocalDate(originalJob.dateCompleted), "d MMM yyyy")
        : "—",
      amendments: "—",
      fee: originalJob.quoteValue != null ? (formatGBP(originalJob.quoteValue) ?? "—") : "—",
      designer: (originalEntry?.designer ?? originalJob.designer)?.trim() || "Unassigned",
      isCurrent: !!originalEntry?.isCurrent,
    },
    ...revisionEntries.map(entry => {
      const revJob = revisionById.get(entry.id)
      const notes = entry.notes?.trim() || ""
      const designer = (entry.designer ?? revJob?.designer)?.trim() || "—"
      return {
        id: entry.id,
        label: entry.revisionLetter ? `Rev ${entry.revisionLetter}` : "Revision",
        status: entry.status ?? revJob?.status ?? "—",
        completed: revJob?.dateCompleted
          ? format(parseLocalDate(revJob.dateCompleted), "d MMM yyyy")
          : "—",
        amendments: notes || "—",
        fee: revJob?.quoteValue != null ? (formatGBP(revJob.quoteValue) ?? "—") : "—",
        designer,
        isCurrent: !!entry.isCurrent,
      }
    }),
  ]

  const ordered = [...rows].reverse()
  const displayRows = preview && collapsed ? ordered.slice(0, 3) : ordered
  const showViewAll = preview && collapsed && ordered.length > 3 && !!onViewAll

  return (
    <section
      className={cn(
        "w-full",
        preview ? "opacity-90" : "rounded-xl border border-bd bg-sr px-5 py-4",
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="h-4 w-4 text-t3 shrink-0" aria-hidden />
          <h2
            className={cn(
              Typography.Small,
              "font-bold uppercase tracking-wider text-t1",
            )}
          >
            Revision History
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!preview && revisionFamily.canAddRevision && (
            <Button variant="outline" size="sm" onClick={onAddRevision}>
              <Plus className="h-3.5 w-3.5" />
              Add revision
            </Button>
          )}
          {showViewAll && (
            <button
              type="button"
              className={cn(
                Typography.Helper,
                "font-bold uppercase tracking-widest text-t3 hover:text-t1",
              )}
              onClick={onViewAll}
            >
              View all
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-bd bg-sr w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full table-fixed text-left border-collapse">
            {preview ? (
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[22%]" />
                <col className="w-[28%]" />
                <col className="w-[26%]" />
                <col className="w-[6%]" />
              </colgroup>
            ) : (
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[28%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[6%]" />
              </colgroup>
            )}
            <thead>
              <tr className="bg-surface-low/60 border-b border-bd">
                {(preview
                  ? (["Revision", "Completed", "Status", "Designer"] as const)
                  : (["Revision", "Status", "Completed", "Amendments", "Fee", "Designer"] as const)
                ).map(col => (
                  <th
                    key={col}
                    className={cn(
                      Typography.Helper,
                      "px-4 py-2.5 font-bold uppercase tracking-widest text-t3",
                    )}
                  >
                    {col}
                  </th>
                ))}
                <th className="px-4 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-low">
              {displayRows.map(row => (
                <tr
                  key={row.id}
                  id={`revision-row-${row.id}`}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-pg/50 group",
                    selectedRevisionId === row.id && "bg-pg/40",
                  )}
                  onClick={() => onSelectedRevisionId(row.id)}
                >
                  <td className={cn(Typography.Small, "px-4 py-3 font-bold text-t1")}>
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {row.label}
                      {!preview && row.isCurrent && (
                        <span className={cn(Typography.Badge, "bg-ac text-on-ac px-1.5 py-0.5 rounded-sm uppercase tracking-tighter")}>
                          Current
                        </span>
                      )}
                    </span>
                  </td>
                  {preview ? (
                    <>
                      <td className={cn(Typography.Small, "px-4 py-3 tabular-nums text-t3")}>
                        {row.completed}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td
                        className={cn(
                          Typography.Small,
                          "px-4 py-3",
                          row.designer === "—" || row.designer === "Unassigned"
                            ? "text-t3"
                            : "text-t1",
                        )}
                      >
                        {row.designer}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className={cn(Typography.Small, "px-4 py-3 tabular-nums text-t3")}>
                        {row.completed}
                      </td>
                      <td
                        className={cn(
                          Typography.Small,
                          "px-4 py-3 break-words",
                          row.amendments === "—" ? "text-t3" : "text-t1",
                        )}
                      >
                        {row.amendments}
                      </td>
                      <td
                        className={cn(
                          Typography.Small,
                          "px-4 py-3 tabular-nums",
                          row.fee === "—" ? "text-t3" : "text-t1",
                        )}
                      >
                        {row.fee}
                      </td>
                      <td
                        className={cn(
                          Typography.Small,
                          "px-4 py-3",
                          row.designer === "—" ? "text-t3" : "text-t1",
                        )}
                      >
                        {row.designer}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 text-right">
                    <ArrowRight
                      className="h-3.5 w-3.5 text-t3 inline-block opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-hidden
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!preview && defaultExpanded === false && ordered.length > displayRows.length && onViewAll && (
          <div className="px-4 py-3 border-t border-surface-low bg-sr">
            <button
              type="button"
              className={cn(Typography.Small, "font-bold text-t1 hover:underline")}
              onClick={onViewAll}
            >
              View all revisions
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
