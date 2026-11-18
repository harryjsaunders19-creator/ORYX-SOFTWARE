"use client"

import { format, parseISO, isValid } from "date-fns"
import Link from "next/link"
import { Clock } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { DashboardWeekEvent } from "../types/stats-types"
import { DashboardEmptyState, DashboardSectionHeader } from "./dashboard-stats-primitives"

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

function shortDate(e: DashboardWeekEvent): string {
  try {
    const start = parseISO(e.startDate)
    if (!isValid(start)) return ""
    return format(start, "EEE d MMM")
  } catch {
    return ""
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
    <div className="flex flex-col gap-6">
      <section aria-labelledby="dashboard-meetings-heading">
        <DashboardSectionHeader
          as="h2"
          id="dashboard-meetings-heading"
          title="Upcoming Meetings"
          size="compact"
        />
        {nextMeeting ? (
          <div className="cc-dashboard-surface border-l-[3px] border-l-t1 p-4">
            <span
              className={cn(
                Typography.Badge,
                "inline-flex rounded-md bg-nested-surface px-2 py-0.5 font-semibold uppercase tracking-wide text-t2",
              )}
            >
              Next meeting
            </span>
            <h3 className={cn(Typography.CardTitle, "mt-2.5 text-t1")}>
              {nextMeeting.title}
            </h3>
            <div className={cn(Typography.Small, "mt-1.5 flex items-center gap-2 text-t2")}>
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {eventTimeLabel(nextMeeting)}
                {shortDate(nextMeeting) && (
                  <>
                    <span className="text-t3"> · </span>
                    {shortDate(nextMeeting)}
                  </>
                )}
              </span>
            </div>
            {nextMeeting.assignees.length > 0 && (
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex -space-x-1.5" aria-hidden>
                  {nextMeeting.assignees.slice(0, 3).map(a => (
                    <div
                      key={a.userId}
                      title={a.userName}
                      className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-sr bg-surface-low text-[9px] font-bold text-t1"
                    >
                      {assigneeInitials(a.userName)}
                    </div>
                  ))}
                </div>
                <p className={cn(Typography.Helper, "truncate text-t3")}>
                  {nextMeeting.assignees.map(a => a.userName).join(", ")}
                </p>
              </div>
            )}
            <Link
              href="/calendar"
              className={cn(
                Typography.Helper,
                "mt-3 inline-block font-medium text-t2 underline decoration-dotted underline-offset-4 transition-colors hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20 rounded-sm",
              )}
            >
              Open calendar
            </Link>
          </div>
        ) : (
          <DashboardEmptyState message="No upcoming meetings" detail="Schedule events from the calendar." />
        )}
      </section>

      <section aria-labelledby="dashboard-site-visits-heading">
        <DashboardSectionHeader
          as="h2"
          id="dashboard-site-visits-heading"
          title="Site Visits"
          size="compact"
        />
        {siteVisits.length === 0 ? (
          <DashboardEmptyState message="No upcoming site visits" detail="Site visits will appear here once scheduled." />
        ) : (
          <ul className="cc-dashboard-panel cc-dashboard-surface divide-y divide-bd-subtle">
            {siteVisits.slice(0, 5).map((e, i) => {
              const title = e.jobDrawingNumber || e.title
              const subtitle = e.jobDrawingNumber
                ? (e.location || e.clientName || e.title)
                : (e.location || e.clientName || "Site visit")
              const isFirst = i === 0

              const row = (
                <div className="flex gap-4 py-3">
                  <div className="w-16 shrink-0 text-right">
                    <p className={cn(Typography.Helper, "font-medium tabular-nums text-t1")}>
                      {shortTime(e)}
                    </p>
                    <p className={cn(Typography.Helper, "mt-0.5 text-t3")}>
                      {shortDate(e)}
                    </p>
                  </div>
                  <div className="relative min-w-0 flex-1 border-l border-bd-subtle pl-4">
                    <span
                      className={cn(
                        "absolute -left-[5px] top-1.5 h-2 w-2 rounded-full ring-2 ring-sr",
                        isFirst ? "bg-t1" : "bg-t3",
                      )}
                      aria-hidden
                    />
                    <p className={cn(Typography.BodyLarge, "truncate font-medium text-t1")}>
                      {title}
                    </p>
                    <p className={cn(Typography.Helper, "mt-0.5 truncate text-t3")}>
                      {subtitle}
                    </p>
                  </div>
                </div>
              )

              return (
                <li key={e.id}>
                  {e.jobId ? (
                    <Link
                      href={`/jobs/${e.jobId}`}
                      className="block px-4 transition-colors hover:bg-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-t1/20"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="px-4">{row}</div>
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
