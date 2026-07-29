"use client"
import { useState } from "react"
import { format } from "date-fns"
import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { cn, parseLocalDate } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse } from "../types/revision-types"

export function JobRevisionOverview({
  job: _job,
  revisionFamily,
  isLoading,
  selectedRevisionId,
  onSelectedRevisionId,
  onAddRevision,
  /** When true, start expanded (e.g. Revisions tab). */
  defaultExpanded = false,
}: {
  job: Job
  revisionFamily: RevisionFamilyResponse | null
  isLoading: boolean
  selectedRevisionId: string | null
  onSelectedRevisionId: (id: string | null) => void
  onAddRevision: () => void
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (isLoading && !revisionFamily) {
    return (
      <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
        <div className="h-5 w-40 skeleton rounded" />
      </section>
    )
  }

  if (!revisionFamily) {
    return (
      <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
        <p className="text-sm text-t4">Revision history unavailable.</p>
      </section>
    )
  }

  const originalJob = revisionFamily.original
  const originalEntry = revisionFamily.chain.find(e => e.isOriginal) ?? null
  const revisionEntries = revisionFamily.chain.filter(e => !e.isOriginal)
  const revisionById = new Map(revisionFamily.revisions.map(r => [r.id, r]))
  const olderCount = revisionEntries.filter(e => !e.isCurrent).length

  const rows: Array<{
    id: string
    label: string
    status: string
    completed: string
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
      designer: originalEntry?.designer ?? originalJob.designer ?? "—",
      isCurrent: !!originalEntry?.isCurrent,
    },
    ...revisionEntries.map(entry => {
      const revJob = revisionById.get(entry.id)
      return {
        id: entry.id,
        label: entry.revisionLetter ? `Rev ${entry.revisionLetter}` : "Revision",
        status: entry.status ?? revJob?.status ?? "—",
        completed: revJob?.dateCompleted
          ? format(parseLocalDate(revJob.dateCompleted), "d MMM yyyy")
          : "—",
        designer: entry.designer ?? revJob?.designer ?? "—",
        isCurrent: !!entry.isCurrent,
      }
    }),
  ]

  const visibleRows = expanded ? rows : rows.filter(r => r.isCurrent)
  // Always show at least original if nothing marked current
  const displayRows = visibleRows.length > 0 ? visibleRows : rows.slice(0, 1)

  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-t1">Revision history</h2>
          <p className="text-xs text-t4 mt-0.5">
            {revisionFamily.revisions.length} revision{revisionFamily.revisions.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {revisionFamily.canAddRevision && (
            <Button variant="outline" size="sm" onClick={onAddRevision}>
              <Plus className="h-3.5 w-3.5" />
              Add revision
            </Button>
          )}
          {rows.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(v => !v)}
              aria-expanded={expanded}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
              {expanded ? "Collapse" : olderCount > 0 ? `Show ${olderCount} older` : "Expand"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-[#E5E7EB] text-left">
              <th className="py-2 pr-4 text-[11px] uppercase tracking-wide font-medium text-t4">Revision</th>
              <th className="py-2 pr-4 text-[11px] uppercase tracking-wide font-medium text-t4">Status</th>
              <th className="py-2 pr-4 text-[11px] uppercase tracking-wide font-medium text-t4">Completed</th>
              <th className="py-2 text-[11px] uppercase tracking-wide font-medium text-t4">Designer</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(row => (
              <tr
                key={row.id}
                id={`revision-row-${row.id}`}
                className={cn(
                  "border-b border-[#E5E7EB] last:border-0 cursor-pointer hover:bg-[#F9FAFB]",
                  selectedRevisionId === row.id && "bg-[#F9FAFB]",
                )}
                onClick={() => onSelectedRevisionId(row.id)}
              >
                <td className="py-2.5 pr-4 font-medium text-t1">
                  {row.label}
                  {row.isCurrent && (
                    <span className="ml-2 text-[11px] font-medium text-t3">Current</span>
                  )}
                </td>
                <td className="py-2.5 pr-4"><StatusBadge status={row.status} /></td>
                <td className="py-2.5 pr-4 tabular-nums text-t2">{row.completed}</td>
                <td className="py-2.5 text-t2">{row.designer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
