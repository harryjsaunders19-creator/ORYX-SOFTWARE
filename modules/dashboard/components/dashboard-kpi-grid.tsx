"use client"

import { Briefcase, Clock, ClipboardCheck, Receipt, AlertTriangle } from "lucide-react"
import { StatCard } from "./dashboard-stats-primitives"

export function DashboardKpiGrid({
  active,
  dueWeek,
  checking,
  invoicing,
  overdueCount,
  totalRevisions,
  dueTodayCount,
  isAdmin,
}: {
  active: number
  dueWeek: number
  checking: number
  invoicing: number
  overdueCount: number
  totalRevisions?: number
  dueTodayCount?: number
  isAdmin: boolean
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          icon={Briefcase}
          label="Active jobs"
          value={active}
          href="/jobs"
          sub={`${totalRevisions ?? 0} revisions in flight`}
          tone="active"
        />
      </div>
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          icon={Clock}
          label="Due this week"
          value={dueWeek}
          href="/jobs?deadline=this_week"
          sub={dueTodayCount ? `${dueTodayCount} due today` : "Nothing due today"}
          tone="due"
        />
      </div>
      <div className="col-span-6 lg:col-span-3">
        <StatCard
          icon={ClipboardCheck}
          label="Requires checking"
          value={checking}
          href="/jobs/checking"
          sub={checking > 0 ? "Waiting for review" : "Checking queue clear"}
          tone="checking"
        />
      </div>
      <div className="col-span-6 lg:col-span-3">
        {isAdmin ? (
          <StatCard
            icon={Receipt}
            label="Ready for invoicing"
            value={invoicing}
            href="/billing"
            sub={invoicing > 0 ? "Awaiting accounts handoff" : "Nothing queued"}
            tone="invoicing"
          />
        ) : (
          <StatCard
            icon={AlertTriangle}
            label="Overdue"
            value={overdueCount}
            href="/jobs?deadline=overdue"
            sub={overdueCount > 0 ? "Needs immediate attention" : "Nothing overdue"}
            tone="overdue"
          />
        )}
      </div>
    </div>
  )
}
