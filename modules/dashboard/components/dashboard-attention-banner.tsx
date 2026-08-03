"use client"

import { AlertCircle, CheckCircle2 } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import { LegendDot } from "./dashboard-stats-primitives"
import { QuickCreateMenu } from "./dashboard-quick-create"

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function DashboardAttentionBanner({
  displayName,
  todayLabel,
  hour,
  needsAttention,
  active,
  overdueCount,
  checking,
  invoicing,
  dueWeek,
  isAdmin,
}: {
  displayName: string
  todayLabel: string
  hour: number
  needsAttention: boolean
  active: number
  overdueCount: number
  checking: number
  invoicing: number
  dueWeek: number
  isAdmin: boolean
}) {
  return (
    <>
      {/* Greeting + New */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className={cn(Typography.PageTitle, "text-t1")}>
            {greetingForHour(hour)}, {displayName}
          </h1>
          <p className={cn(Typography.Small, "mt-1 text-t3")}>{todayLabel}</p>
        </div>
        <div className="shrink-0">
          <QuickCreateMenu />
        </div>
      </header>

      {/* Attention / status strip */}
      {needsAttention ? (
        <div className="flex flex-col gap-3 rounded-xl border border-dn-bd bg-dn-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm text-dn-tx">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-dn" aria-hidden />
            <p className="font-medium">
              {overdueCount > 0
                ? `Attention required — ${overdueCount} overdue job${overdueCount === 1 ? "" : "s"} need${overdueCount === 1 ? "s" : ""} action.`
                : checking > 0
                  ? `Attention required — ${checking} job${checking === 1 ? "" : "s"} require${checking === 1 ? "s" : ""} checking.`
                  : "Attention required — clients on hold need review."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
            <LegendDot tone="active" label="Active jobs" value={active} />
            <LegendDot tone="overdue" label="Overdue" value={overdueCount} />
            <LegendDot tone="checking" label="Requires checking" value={checking} />
            {isAdmin && (
              <LegendDot tone="invoicing" label="Ready for invoicing" value={invoicing} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-ok-bd bg-ok-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm text-ok-tx">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-ic" aria-hidden />
            <p className="font-medium">
              ORYX is operating normally — {active} active job{active === 1 ? "" : "s"}, nothing overdue.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
            <LegendDot tone="active" label="Active jobs" value={active} />
            <LegendDot tone="due" label="Due this week" value={dueWeek} />
            <LegendDot tone="checking" label="Requires checking" value={checking} />
            {isAdmin && (
              <LegendDot tone="invoicing" label="Ready for invoicing" value={invoicing} />
            )}
          </div>
        </div>
      )}
    </>
  )
}
