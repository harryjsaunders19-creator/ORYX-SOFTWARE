"use client"

import Link from "next/link"
import { DrawingStatusBadge } from "@/modules/jobs/components/drawing-status-badge"
import { revisionBadgeLabel } from "@/modules/jobs/components/jobs-register-helpers"

type SiteJob = {
  id: string
  drawingNumber: string
  status: string
  typeOfWorks: string
  revisionLetter?: string | null
}

export function SiteJobsList({
  jobs,
  excludeJobId,
}: {
  jobs: SiteJob[]
  excludeJobId?: string
}) {
  const list = excludeJobId ? jobs.filter(j => j.id !== excludeJobId) : jobs

  if (list.length === 0) {
    return <p className="text-xs text-t3">No jobs at this site yet.</p>
  }

  return (
    <ul className="divide-y divide-bd/60 rounded-lg border border-bd">
      {list.map(job => {
        const rev = revisionBadgeLabel(job.revisionLetter ?? null)
        return (
          <li key={job.id}>
            <Link
              href={`/jobs?selected=${encodeURIComponent(job.id)}`}
              className="flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-pg"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="type-drawing-number text-sm font-semibold text-t1">
                  {job.drawingNumber}
                </span>
                <DrawingStatusBadge status={job.status} />
              </div>
              <p className="text-xs text-t2">{job.typeOfWorks || "—"}</p>
              {rev && <p className="text-[11px] text-t3">{rev}</p>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
