"use client"

import { format, parseISO, isValid } from "date-fns"
import Link from "next/link"
import { Clock } from "lucide-react"
import type { DashboardWeekEvent } from "../types/stats-types"

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

export function DashboardScheduleRail({ events }: { events: DashboardWeekEvent[] }) {
  const siteVisits = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)
  const nextMeeting = teamsMeetings[0] ?? null

  return (
    <div className="space-y-10 md:space-y-12">
      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#4c4546] dark:text-t3">
          Upcoming Meetings
        </h3>
        {nextMeeting ? (
          <div className="relative overflow-hidden rounded-2xl bg-black p-8 text-white">
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
            <div className="relative z-10">
              <span className="rounded-full bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                Next Meeting
              </span>
              <h4 className="mt-4 mb-2 text-2xl font-semibold tracking-tight">{nextMeeting.title}</h4>
              <div className="mb-6 flex items-center gap-2 text-base text-white/70">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                <span>{eventTimeLabel(nextMeeting)}</span>
              </div>
              {nextMeeting.assignees.length > 0 && (
                <div className="flex -space-x-2">
                  {nextMeeting.assignees.slice(0, 2).map(a => (
                    <div
                      key={a.userId}
                      title={a.userName}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-[#d9dadc] text-[10px] font-bold text-black"
                    >
                      {a.userName.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  ))}
                  {nextMeeting.assignees.length > 2 && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-black bg-[#eeeef0] text-[10px] font-bold text-black">
                      +{nextMeeting.assignees.length - 2}
                    </div>
                  )}
                </div>
              )}
              <Link
                href="/calendar"
                className="mt-6 inline-block text-xs font-medium text-white/70 underline decoration-dotted underline-offset-4 hover:text-white"
              >
                Open calendar
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--stitch-outline-variant,#cfc4c5)] bg-sr p-8">
            <p className="text-sm text-t3">No meetings scheduled this week.</p>
            <Link href="/calendar" className="mt-3 inline-block text-xs font-semibold text-t2 underline decoration-dotted">
              Open calendar
            </Link>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#4c4546] dark:text-t3">
          Site Visits
        </h3>
        {siteVisits.length === 0 ? (
          <p className="text-sm text-t3">No site visits scheduled this week.</p>
        ) : (
          <div className="space-y-0">
            {siteVisits.slice(0, 5).map((e, i, arr) => {
              const isFirst = i === 0
              const isLast = i === arr.length - 1
              return (
                <div key={e.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div
                      className={
                        isFirst
                          ? "h-2 w-2 rounded-full bg-black ring-4 ring-black/10 dark:bg-t1 dark:ring-white/10"
                          : "h-2 w-2 rounded-full bg-[#7e7576] dark:bg-t4"
                      }
                    />
                    {!isLast && <div className="my-2 w-px flex-1 bg-[var(--stitch-outline-variant,#cfc4c5)]" />}
                  </div>
                  <div className={isLast ? "pb-0" : "pb-6"}>
                    <p className={`text-sm font-medium ${isFirst ? "text-black dark:text-t1" : "text-[#4c4546] dark:text-t3"}`}>
                      {shortTime(e)}
                      <span className="ml-2 font-normal text-t4">
                        {format(parseISO(e.startDate), "EEE d")}
                      </span>
                    </p>
                    <h5 className="text-base font-semibold text-t1">
                      {e.jobDrawingNumber && e.jobId ? (
                        <Link href={`/jobs/${e.jobId}`} className="hover:underline">
                          {e.jobDrawingNumber}
                        </Link>
                      ) : (
                        e.title
                      )}
                    </h5>
                    <p className="text-[13px] text-[#4c4546] dark:text-t3">
                      {e.jobDrawingNumber ? e.title : (e.location || e.clientName || "Site visit")}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-[var(--stitch-outline-variant,#cfc4c5)] bg-[var(--stitch-sidebar-bg,#eeeef0)] p-6 dark:bg-surface-low">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#4c4546] dark:text-t3">
            System Latency
          </span>
          <Link href="/health" className="text-[10px] font-bold text-black hover:underline dark:text-t1">
            Status
          </Link>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-[var(--stitch-outline-variant,#cfc4c5)]">
          <div className="h-full w-[85%] rounded-full bg-black dark:bg-t1" />
        </div>
        <p className="mt-4 text-[12px] italic text-[#4c4546] dark:text-t3">All services operational</p>
      </div>
    </div>
  )
}
