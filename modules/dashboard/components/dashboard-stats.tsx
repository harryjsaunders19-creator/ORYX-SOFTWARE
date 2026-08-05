"use client"

import { useMemo } from "react"
import { format, startOfWeek, endOfWeek } from "date-fns"
import { RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useUser } from "@/shared/providers/user-context"
import { useApi } from "@/shared/hooks/use-api"
import type { StatsData, DashboardWeekEvent } from "../types/stats-types"
import type { Job, ClientHoldWithClient } from "@/lib/types"
import { DashboardHeading } from "./dashboard-heading"
import { DashboardKpiGrid } from "./dashboard-kpi-grid"
import { DashboardOverduePanel } from "./dashboard-overdue-panel"
import { DashboardHoldsPanel } from "./dashboard-holds-panel"
import { DashboardScheduleRail } from "./dashboard-schedule-rail"

export function DashboardStats({
  statsKey: statsKeyProp,
  fallbackStats,
}: {
  statsKey?: string
  fallbackStats?: StatsData | null
  userName?: string
} = {}) {
  const { isAdmin, userName } = useUser()

  const statsKey = useMemo(() => {
    if (statsKeyProp) return statsKeyProp
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
    const params = new URLSearchParams({
      calendarFrom: format(weekStart, "yyyy-MM-dd"),
      calendarTo: format(weekEnd, "yyyy-MM-dd"),
    })
    return `/api/stats?${params}`
  }, [statsKeyProp])

  const { data: stats, error: swrError, isLoading, mutate } = useApi<StatsData>(statsKey, {
    fallbackData: fallbackStats ?? undefined,
    ...(fallbackStats ? { revalidateIfStale: false, revalidateOnMount: false } : {}),
  })

  const events: DashboardWeekEvent[] = stats?.weekEvents ?? []
  const overdueJobs: Job[] = stats?.overdueJobs ?? []
  const holds: ClientHoldWithClient[] = (stats?.holds ?? []).slice(0, 4)
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load dashboard data") : null

  const overdueCount = stats?.overdueCount ?? 0
  const dueWeek = stats?.dueThisWeekCount ?? 0
  const checking = stats?.checking ?? 0
  const invoicing = stats?.readyForInvoicingCount ?? 0
  const active = stats?.totalActiveJobs ?? 0

  if (error) {
    return (
      <div className="space-y-3 rounded-xl border border-dn-bd bg-dn-bg p-4 text-sm text-dn-tx">
        <p className="font-medium">Failed to load dashboard data.</p>
        <p className="text-xs text-t2">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void mutate()}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  if (isLoading && !stats) {
    return (
      <div className="cc-dashboard space-y-6">
        <div className="h-12 max-w-md rounded-lg skeleton" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[104px] rounded-xl skeleton" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-8" />
          <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-4" />
        </div>
      </div>
    )
  }

  return (
    <div className="cc-dashboard">
      <DashboardHeading
        userName={userName}
        overdueCount={overdueCount}
        checking={checking}
        dueWeek={dueWeek}
        invoicing={invoicing}
        isAdmin={isAdmin}
      />

      <DashboardKpiGrid
        active={active}
        dueWeek={dueWeek}
        checking={checking}
        invoicing={invoicing ?? 0}
        overdueCount={overdueCount}
        activeRevisions={stats?.activeRevisions}
        dueTodayCount={stats?.dueTodayCount}
        isAdmin={isAdmin}
      />

      <div className="grid grid-cols-12 items-start gap-6">
        <div className="col-span-12 flex flex-col gap-6 lg:col-span-8">
          <DashboardOverduePanel
            overdueJobs={overdueJobs}
            overdueCount={overdueCount}
          />
          <DashboardHoldsPanel
            holds={holds}
            clientsOnHold={stats?.clientsOnHold}
          />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <DashboardScheduleRail events={events} />
        </div>
      </div>
    </div>
  )
}
