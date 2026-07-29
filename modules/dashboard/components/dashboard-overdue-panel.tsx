"use client"

import Link from "next/link"
import { CheckCircle2, ExternalLink } from "lucide-react"
import { RevisionFamilyBadge } from "@/modules/jobs/components/badges/revision-family-badge"
import { cn, getJobDeadlineInfo } from "@/shared/utils/utils"
import { TONE, Panel, PanelEmpty } from "./dashboard-stats-primitives"
import type { Job } from "@/lib/types"

export function DashboardOverduePanel({
  overdueJobs,
  overdueCount,
}: {
  overdueJobs: Job[]
  overdueCount: number
}) {
  return (
    <Panel
      title="Overdue jobs"
      count={overdueCount}
      countTone="overdue"
      viewAllHref="/jobs?deadline=overdue"
    >
      {overdueJobs.length === 0 ? (
        <PanelEmpty icon={CheckCircle2} message="Nothing overdue — operations are on track." />
      ) : (
        <ul className="divide-y divide-bd">
          {overdueJobs.map(job => {
            const dl = getJobDeadlineInfo(job)
            return (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-low"
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE.overdue.dot)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RevisionFamilyBadge job={job} size="xs" />
                      <span className="type-drawing-number text-xs font-semibold text-t1">{job.drawingNumber}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-t3">
                      {[job.clientCompany, job.address].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 type-badge",
                    TONE.overdue.badge,
                  )}>
                    {dl.label}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-t4" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
