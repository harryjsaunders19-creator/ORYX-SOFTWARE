import { format, startOfWeek, endOfWeek } from "date-fns"
import { PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { DashboardStats } from "./dashboard-stats"
import { getCurrentUser } from "@/shared/auth/auth"
import { buildDashboardStats } from "../services/build-dashboard-stats"
import type { Role } from "@/shared/auth/permissions"
import type { StatsData } from "../types/stats-types"

export default async function DashboardPage() {
  const today = format(new Date(), "EEEE, d MMMM yyyy")
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const calendarFrom = format(weekStart, "yyyy-MM-dd")
  const calendarTo = format(weekEnd, "yyyy-MM-dd")
  const statsKey = `/api/stats?calendarFrom=${calendarFrom}&calendarTo=${calendarTo}`

  let fallbackStats: StatsData | null = null
  const user = await getCurrentUser().catch(() => null)
  if (user) {
    try {
      fallbackStats = await buildDashboardStats({
        role: user.role as Role,
        calendarFrom,
        calendarTo,
      })
    } catch {
      fallbackStats = null
    }
  }

  return (
    <PageShell>
      <PageHeader title="Dashboard" description={today} />
      <DashboardStats statsKey={statsKey} fallbackStats={fallbackStats} />
    </PageShell>
  )
}
