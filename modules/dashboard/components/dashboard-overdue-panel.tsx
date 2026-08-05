"use client"

import Link from "next/link"
import { format, parseISO, differenceInCalendarDays } from "date-fns"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { getJobDeadlineInfo } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import { DashboardEmptyState, DashboardSectionHeader } from "./dashboard-stats-primitives"

function dueCellLabel(job: Job): { date: string; overdue: string | null } {
  const dl = getJobDeadlineInfo(job)
  if (!job.requiredByDate) return { date: dl.label, overdue: null }
  try {
    const due = parseISO(job.requiredByDate)
    const days = differenceInCalendarDays(new Date(), due)
    const datePart = format(due, "d MMM")
    if (days > 0) return { date: datePart, overdue: `${days}d overdue` }
    if (days === 0) return { date: "Today", overdue: null }
    return { date: datePart, overdue: null }
  } catch {
    return { date: dl.label, overdue: null }
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
    <section aria-labelledby="dashboard-overdue-heading">
      <DashboardSectionHeader
        as="h2"
        id="dashboard-overdue-heading"
        title="Overdue Jobs"
        count={overdueCount}
        countTone="overdue"
        icon={AlertTriangle}
        viewAllHref="/jobs?deadline=overdue"
        viewAllLabel="View all overdue"
      />

      {overdueJobs.length === 0 ? (
        <DashboardEmptyState
          message="No overdue jobs"
          detail="Everything is up to date."
        />
      ) : (
        <div className="cc-dashboard-panel cc-dashboard-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left">
              <thead className="bg-surface-low">
                <tr>
                  <th className={cn(Typography.TableHead, "px-4 py-2.5 text-t2 sm:px-5")}>
                    Drawing
                  </th>
                  <th className={cn(Typography.TableHead, "px-4 py-2.5 text-t2 sm:px-5")}>
                    Description
                  </th>
                  <th className={cn(Typography.TableHead, "px-4 py-2.5 text-t2 sm:px-5")}>
                    Due
                  </th>
                  <th className={cn(Typography.TableHead, "px-4 py-2.5 text-right text-t2 sm:px-5")}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {overdueJobs.map((job, i) => {
                  const description =
                    [job.typeOfWorks, job.address || job.siteAddress, job.clientCompany]
                      .filter(Boolean)
                      .join(" — ") || "—"
                  const due = dueCellLabel(job)
                  return (
                    <tr
                      key={job.id}
                      className={cn(
                        "group relative",
                        i > 0 && "border-t border-bd-subtle",
                      )}
                    >
                      <td className="px-4 py-3 sm:px-5">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="absolute inset-0 z-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-t1/25"
                          aria-label={`Open job ${job.drawingNumber}`}
                        />
                        <span
                          className={cn(
                            Typography.DrawingNumber,
                            Typography.Table,
                            "relative z-10 inline-flex rounded-md bg-dn-bg px-2 py-0.5 font-bold text-dn-tx",
                          )}
                        >
                          {job.drawingNumber}
                        </span>
                      </td>
                      <td className="relative z-10 max-w-[220px] truncate px-4 py-3 text-t1 pointer-events-none sm:max-w-[280px] sm:px-5">
                        <span className={Typography.Table}>{description}</span>
                      </td>
                      <td className="relative z-10 whitespace-nowrap px-4 py-3 pointer-events-none sm:px-5">
                        <div className="flex flex-col gap-0.5">
                          <span className={cn(Typography.Table, "text-t1")}>{due.date}</span>
                          {due.overdue && (
                            <span className={cn(Typography.Helper, "font-medium text-dn-tx")}>
                              {due.overdue}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="relative z-10 px-4 py-3 text-right pointer-events-none sm:px-5">
                        <span
                          className="inline-flex rounded-md p-1 text-t3 transition-colors group-hover:bg-nested-surface group-hover:text-t1"
                          aria-hidden
                        >
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
