"use client"

import { format } from "date-fns"
import Link from "next/link"
import { MapPin, Video } from "lucide-react"
import { Panel, PanelEmpty } from "./dashboard-stats-primitives"
import type { DashboardWeekEvent } from "../types/stats-types"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

export function DashboardWeekPanels({ events }: { events: DashboardWeekEvent[] }) {
  const siteVisits = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-6">
        <Panel
          title="Upcoming site visits"
          count={siteVisits.length || undefined}
          viewAllHref="/calendar"
          viewAllLabel="View calendar"
        >
          {siteVisits.length === 0 ? (
            <PanelEmpty icon={MapPin} message="No site visits scheduled this week." />
          ) : (
            <ul className="divide-y divide-bd">
              {siteVisits.slice(0, 5).map(e => (
                <li key={e.id} className="px-5 py-3.5">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs tabular-nums text-t3">
                      {format(new Date(e.startDate), "EEE d MMM")}
                    </span>
                    {!e.allDay && (
                      <span className="text-xs tabular-nums text-t3">{e.startDate.slice(11, 16)}</span>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium text-t1">{e.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {e.assignees[0] && <span className="text-xs text-t3">{e.assignees[0].userName}</span>}
                    {e.jobDrawingNumber && e.jobId && (
                      <Link
                        href={`/jobs/${e.jobId}`}
                        className="type-drawing-number text-xs font-medium text-t2 hover:text-t1 hover:underline"
                      >
                        {e.jobDrawingNumber}
                      </Link>
                    )}
                    {e.location && (
                      <span className="flex items-center gap-0.5 text-xs text-t3">
                        <MapPin className="h-3 w-3" />{e.location}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="col-span-12 lg:col-span-6">
        <Panel
          title="Upcoming meetings"
          count={teamsMeetings.length || undefined}
          viewAllHref="/calendar"
          viewAllLabel="View calendar"
        >
          {teamsMeetings.length === 0 ? (
            <PanelEmpty icon={Video} message="No meetings scheduled this week." />
          ) : (
            <ul className="divide-y divide-bd">
              {teamsMeetings.slice(0, 5).map(e => (
                <li key={e.id} className="px-5 py-3.5">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs tabular-nums text-t3">
                      {format(new Date(e.startDate), "EEE d MMM")}
                    </span>
                    {!e.allDay && (
                      <span className="text-xs tabular-nums text-t3">
                        {e.startDate.slice(11, 16)} – {e.endDate.slice(11, 16)}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium text-t1">{e.title}</p>
                  {e.assignees.length > 0 && (
                    <p className="mt-1 text-xs text-t3">
                      {e.assignees.map(a => a.userName).join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
