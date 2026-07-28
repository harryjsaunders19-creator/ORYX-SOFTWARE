"use client"

import { useMemo } from "react"
import { format, startOfWeek, endOfWeek } from "date-fns"
import { RefreshCw } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useUser } from "@/shared/providers/user-context"
import { useApi } from "@/shared/hooks/use-api"
import type { StatsData, DashboardWeekEvent } from "../types/stats-types"
import type { Job, ClientHoldWithClient } from "@/lib/types"
import { DashboardAttentionBanner } from "./dashboard-attention-banner"
import { DashboardKpiGrid } from "./dashboard-kpi-grid"
import { DashboardOverduePanel } from "./dashboard-overdue-panel"
import { DashboardHoldsPanel } from "./dashboard-holds-panel"
import { DashboardWeekPanels } from "./dashboard-week-panels"

export function DashboardStats({
  statsKey: statsKeyProp,
  fallbackStats,
  userName,
}: {
  statsKey?: string
  fallbackStats?: StatsData | null
  userName?: string
} = {}) {
  const { isAdmin, userName: ctxName } = useUser()
  const displayName = (userName || ctxName || "there").split(" ")[0]

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
  const holds: ClientHoldWithClient[] = (stats?.holds ?? []).slice(0, 5)
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load dashboard data") : null

  const now = new Date()
  const todayLabel = format(now, "EEEE, d MMMM yyyy")

  const overdueCount = stats?.overdueCount ?? 0
  const dueWeek = stats?.dueThisWeekCount ?? 0
  const checking = stats?.checking ?? 0
  const invoicing = stats?.readyForInvoicingCount ?? 0
  const active = stats?.totalActiveJobs ?? 0
  const needsAttention = overdueCount > 0 || checking > 0 || (stats?.clientsOnHold ?? 0) > 0

  if (error) {
    return (
      <div className="space-y-3 rounded-xl border border-dn-bd bg-dn-bg p-4 text-sm text-dn-tx">
        <p className="font-medium">Failed to load dashboard data.</p>
        <p className="text-xs text-t3">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void mutate()}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  if (isLoading && !stats) {
    return (
      <div className="space-y-8">
        <div className="h-24 rounded-xl skeleton" />
        <div className="skeleton h-14 w-full rounded-xl" />
        <div className="grid grid-cols-12 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-span-6 h-36 rounded-xl skeleton lg:col-span-3" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-6" />
          <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-6" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <DashboardAttentionBanner
        displayName={displayName}
        todayLabel={todayLabel}
        hour={now.getHours()}
        needsAttention={needsAttention}
        active={active}
        overdueCount={overdueCount}
        checking={checking}
        invoicing={invoicing ?? 0}
        dueWeek={dueWeek}
        isAdmin={isAdmin}
      />

      <DashboardKpiGrid
        active={active}
        dueWeek={dueWeek}
        checking={checking}
        invoicing={invoicing ?? 0}
        overdueCount={overdueCount}
        totalRevisions={stats?.totalRevisions}
        dueTodayCount={stats?.dueTodayCount}
        isAdmin={isAdmin}
      />

      {/* Attention panels */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <DashboardOverduePanel
            overdueJobs={overdueJobs}
            overdueCount={overdueCount}
          />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <DashboardHoldsPanel
            holds={holds}
            clientsOnHold={stats?.clientsOnHold}
          />
        </div>
      </div>

      <DashboardWeekPanels events={events} />
    </div>
  )
}
