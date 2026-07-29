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
  /** When true, show the full chain (Revisions tab). */
  defaultExpanded = false,
  /** Compact preview: show a few rows + "View all revisions". */
  preview = false,
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
  onViewAll?: () => void
}) {
  if (isLoading && !revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr px-5 py-4">
        <div className="h-5 w-40 skeleton rounded" />
      </section>
    )
  }

  if (!revisionFamily) {
    return (
      <section className="rounded-xl border border-bd bg-sr px-5 py-4">
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
      designer: originalEntry?.designer ?? originalJob.designer ?? "—",
      isCurrent: !!originalEntry?.isCurrent,
    },
    ...revisionEntries.map(entry => {
      const revJob = revisionById.get(entry.id)
      const notes = entry.notes?.trim() || ""
      return {
        id: entry.id,
        label: entry.revisionLetter ? `Rev ${entry.revisionLetter}` : "Revision",
        status: entry.status ?? revJob?.status ?? "—",
        completed: revJob?.dateCompleted
          ? format(parseLocalDate(revJob.dateCompleted), "d MMM yyyy")
          : "—",
        amendments: notes || "—",
        fee: revJob?.quoteValue != null ? (formatGBP(revJob.quoteValue) ?? "—") : "—",
        designer: entry.designer ?? revJob?.designer ?? "—",
        isCurrent: !!entry.isCurrent,
      }
    }),
  ]

  // Newest first to match Stitch mock
  const ordered = [...rows].reverse()
  const displayRows = preview
    ? ordered.slice(0, 3)
    : defaultExpanded || !preview
      ? ordered
      : ordered.filter(r => r.isCurrent)

  return (
    <section className={cn("w-full", !preview && "rounded-xl border border-bd bg-sr px-5 py-4")}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 min-w-0">
          {preview && <Clock className="h-[18px] w-[18px] text-t3 shrink-0" aria-hidden />}
          <div className="min-w-0">
            <h2 className={cn(Typography.BodyLarge, "font-bold text-t1")}>Revision History</h2>
            {!preview && (
              <p className={cn(Typography.Helper, "text-t4 mt-0.5")}>
                {revisionFamily.revisions.length} revision
                {revisionFamily.revisions.length === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {revisionFamily.canAddRevision && (
            <Button variant="outline" size="sm" onClick={onAddRevision}>
              <Plus className="h-3.5 w-3.5" />
              Add revision
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-bd bg-sr w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full table-fixed text-left border-collapse">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-low border-b border-bd">
                {(["Revision", "Status", "Completed", "Amendments", "Fee", "Designer"] as const).map(
                  col => (
                    <th
                      key={col}
                      className={cn(
                        Typography.Helper,
                        "px-4 py-3 font-bold uppercase tracking-[0.05em] text-t3",
                      )}
                    >
                      {col}
                    </th>
                  ),
                )}
                <th className="px-4 py-3" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-low">
              {displayRows.map(row => (
                <tr
                  key={row.id}
                  id={`revision-row-${row.id}`}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-pg/50",
                    selectedRevisionId === row.id && "bg-pg/40",
                  )}
                  onClick={() => onSelectedRevisionId(row.id)}
                >
                  <td className={cn(Typography.Small, "px-4 py-4 font-bold text-t1")}>
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      {row.label}
                      {row.isCurrent && (
                        <span className="bg-ac text-on-ac text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-tighter font-bold">
                          Current
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={cn(Typography.Small, "px-4 py-4 tabular-nums text-t3")}>
                    {row.completed}
                  </td>
                  <td
                    className={cn(
                      Typography.Small,
                      "px-4 py-4 break-words",
                      row.amendments === "—" ? "text-t3" : "text-t1",
                    )}
                    title={row.amendments !== "—" ? row.amendments : undefined}
                  >
                    {row.amendments}
                  </td>
                  <td
                    className={cn(
                      Typography.Small,
                      "px-4 py-4 tabular-nums",
                      row.fee === "—" ? "text-t3" : "text-t1",
                    )}
                  >
                    {row.fee}
                  </td>
                  <td
                    className={cn(
                      Typography.Small,
                      "px-4 py-4",
                      row.designer === "—" ? "text-t3" : "text-t1",
                    )}
                  >
                    {row.designer}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <ArrowRight className="h-4 w-4 text-t3 inline-block" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview && ordered.length > displayRows.length && onViewAll && (
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
