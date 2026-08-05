"use client"

import { format, parseISO, isValid } from "date-fns"
import Link from "next/link"
import { Clock } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { DashboardWeekEvent } from "../types/stats-types"
import { DashboardEmptyState } from "./dashboard-stats-primitives"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

function eventTimeLabel(e: DashboardWeekEvent): string {
  if (e.allDay) return "All day"
  try {
    const start = parseISO(e.startDate)
    const end = parseISO(e.endDate)
    if (!isValid(start)) return ""
    const startLabel = format(start, "h:mm a")
    if (!isValid(end)) return startLabel
    return `${startLabel} — ${format(end, "h:mm a")}`
  } catch {
    return e.startDate.slice(11, 16)
  }
}

function shortTime(e: DashboardWeekEvent): string {
  if (e.allDay) return "All day"
  try {
    const start = parseISO(e.startDate)
    if (!isValid(start)) return ""
    return format(start, "h:mm a")
  } catch {
    return e.startDate.slice(11, 16)
  }
}

function assigneeInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()
}

export function DashboardScheduleRail({ events }: { events: DashboardWeekEvent[] }) {
  const siteVisits = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)
  const nextMeeting = teamsMeetings[0] ?? null

  return (
    <div className="space-y-8 md:space-y-10">
      <section aria-labelledby="dashboard-meetings-heading">
        <h2
          id="dashboard-meetings-heading"
          className={cn(Typography.Label, "mb-3 font-semibold uppercase tracking-[0.16em] text-t2")}
        >
          Upcoming Meetings
        </h2>
        {nextMeeting ? (
          <div className="rounded-xl border border-bd border-l-[3px] border-l-t1 bg-sr p-5 shadow-card">
            <span
              className={cn(
                Typography.Badge,
                "inline-flex rounded-md bg-nested-surface px-2 py-0.5 font-semibold uppercase tracking-wide text-t2",
              )}
            >
              Next meeting
            </span>
            <h3 className={cn(Typography.CardTitle, "mt-3 text-t1")}>
              {nextMeeting.title}
            </h3>
            <div className={cn(Typography.Small, "mt-2 flex items-center gap-2 text-t2")}>
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {eventTimeLabel(nextMeeting)}
                {isValid(parseISO(nextMeeting.startDate)) && (
                  <>
                    <span className="text-t3"> · </span>
                    {format(parseISO(nextMeeting.startDate), "EEE d MMM")}
                  </>
                )}
              </span>
            </div>
            {nextMeeting.assignees.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex -space-x-1.5" aria-hidden>
                  {nextMeeting.assignees.slice(0, 3).map(a => (
                    <div
                      key={a.userId}
                      title={a.userName}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-sr bg-surface-low text-[10px] font-bold text-t1"
                    >
                      {assigneeInitials(a.userName)}
                    </div>
                  ))}
                </div>
                <p className={cn(Typography.Helper, "truncate text-t2")}>
                  {nextMeeting.assignees.map(a => a.userName).join(", ")}
                </p>
              </div>
            )}
            <Link
              href="/calendar"
              className={cn(
                Typography.Helper,
                "mt-4 inline-block font-medium text-t2 underline decoration-dotted underline-offset-4 transition-colors hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20 rounded-sm",
              )}
            >
              Open calendar
            </Link>
          </div>
        ) : (
          <DashboardEmptyState message="No upcoming meetings" />
        )}
      </section>

      <section aria-labelledby="dashboard-site-visits-heading">
        <h2
          id="dashboard-site-visits-heading"
          className={cn(Typography.Label, "mb-3 font-semibold uppercase tracking-[0.16em] text-t2")}
        >
          Site Visits
        </h2>
        {siteVisits.length === 0 ? (
          <DashboardEmptyState message="No upcoming site visits" />
        ) : (
          <ul className="overflow-hidden rounded-xl border border-bd bg-sr shadow-card">
            {siteVisits.slice(0, 5).map((e, i, arr) => {
              const isFirst = i === 0
              const title = e.jobDrawingNumber || e.title
              const subtitle = e.jobDrawingNumber
                ? (e.location || e.clientName || e.title)
                : (e.location || e.clientName || "Site visit")
              const inner = (
                <>
                  <div className="flex flex-col items-center pt-1.5" aria-hidden>
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        isFirst ? "bg-t1 ring-4 ring-t1/10" : "bg-t3",
                      )}
                    />
                    {i < arr.length - 1 && <div className="mt-1 w-px flex-1 bg-bd" />}
                  </div>
                  <div className="min-w-0 pb-4">
                    <p className={cn(Typography.Helper, "font-medium text-t2")}>
                      {shortTime(e)}
                      <span className="ml-2 font-normal text-t3">
                        {format(parseISO(e.startDate), "EEE d")}
                      </span>
                    </p>
                    <p className={cn(Typography.BodyLarge, "mt-0.5 truncate text-t1")}>
                      {title}
                    </p>
                    <p className={cn(Typography.Helper, "mt-0.5 truncate text-t2")}>
                      {subtitle}
                    </p>
                  </div>
                </>
              )

              return (
                <li key={e.id}>
                  {e.jobId ? (
                    <Link
                      href={`/jobs/${e.jobId}`}
                      className="grid grid-cols-[12px_1fr] gap-3 px-4 pt-4 transition-colors hover:bg-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-t1/20"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className="grid grid-cols-[12px_1fr] gap-3 px-4 pt-4">
                      {inner}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
