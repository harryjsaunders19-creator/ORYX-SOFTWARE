"use client"

import Link from "next/link"
import { format, parseISO, differenceInCalendarDays } from "date-fns"
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react"
import { getJobDeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"

function dueCellLabel(job: Job): string {
  const dl = getJobDeadlineInfo(job)
  if (!job.requiredByDate) return dl.label
  try {
    const due = parseISO(job.requiredByDate)
    const days = differenceInCalendarDays(new Date(), due)
    const datePart = format(due, "d MMM")
    if (days > 0) return `${datePart} (Overdue ${days}d)`
    if (days === 0) return `Today`
    return datePart
  } catch {
    return dl.label
  }
}

export function DashboardOverduePanel({
  overdueJobs,
  overdueCount,
}: {
  overdueJobs: Job[]
  overdueCount: number
}) {
  return (
    <section>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 fill-[#ba1a1a] text-[#ba1a1a]" aria-hidden />
          <h3 className="type-section-heading text-t1">Overdue Jobs</h3>
          {overdueCount > 0 && (
            <span className="rounded-md bg-[var(--stitch-error-container,#ffdad6)] px-2 py-0.5 text-xs font-bold text-[var(--stitch-on-error-container,#93000a)] tabular-nums">
              {overdueCount}
            </span>
          )}
        </div>
        <Link
          href="/jobs?deadline=overdue"
          className="text-xs font-semibold text-[#4c4546] underline decoration-dotted underline-offset-4 transition-colors hover:text-black dark:text-t3 dark:hover:text-t1"
        >
          View All Overdue
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-bd bg-sr shadow-card">
        {overdueJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12">
            <CheckCircle2 className="h-5 w-5 text-t4" aria-hidden />
            <p className="text-sm text-t3">Nothing overdue — operations are on track.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-bd bg-surface-low">
                <tr>
                  <th className="px-6 py-4 text-sm font-medium text-t3">Job ID</th>
                  <th className="px-6 py-4 text-sm font-medium text-t3">Description</th>
                  <th className="px-6 py-4 text-sm font-medium text-t3">Due Date</th>
                  <th className="px-6 py-4 text-right text-sm font-medium text-t3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bd-subtle">
                {overdueJobs.map(job => {
                  const description =
                    [job.typeOfWorks, job.address || job.siteAddress, job.clientCompany]
                      .filter(Boolean)
                      .join(" — ") || "—"
                  return (
                    <tr key={job.id} className="group transition-colors hover:bg-hover-surface">
                      <td className="px-6 py-5">
                        <span className="rounded bg-[var(--stitch-error-container,#ffdad6)] px-3 py-1 font-mono text-[13px] font-bold text-[var(--stitch-on-error-container,#93000a)]">
                          {job.drawingNumber}
                        </span>
                      </td>
                      <td className="max-w-[280px] truncate px-6 py-5 text-base text-t1">
                        {description}
                      </td>
                      <td className="whitespace-nowrap px-6 py-5 text-t3">
                        {dueCellLabel(job)}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="inline-flex rounded-full p-2 opacity-0 transition-opacity hover:bg-nested-surface group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={`Open ${job.drawingNumber}`}
                        >
                          <ExternalLink className="h-4 w-4 text-t2" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
