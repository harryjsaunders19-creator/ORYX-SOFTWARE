"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, formatDistanceToNow, startOfWeek, endOfWeek } from "date-fns"
import { RevisionFamilyBadge } from "@/components/revision-family-badge"
import {
  MapPin, Video, Receipt, Briefcase, Activity, Plus,
  AlertOctagon, ClipboardCheck, AlertTriangle, Clock, RefreshCw, ChevronRight,
  CheckCircle2, BarChart3, PoundSterling,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu"
import { useUser } from "@/shared/providers/user-context"
import { cn, formatGBP, getDeadlineInfo } from "@/shared/utils/utils"
import { useApi } from "@/shared/hooks/use-api"
import { JOB_STATUSES } from "@/lib/constants"
import type { StatsData, DashboardWeekEvent } from "../types/stats-types"
import type { ActivityResponse } from "../types/activity-types"
import type { Job, ClientHoldWithClient } from "@/lib/types"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function buildOperationalSummary(stats: StatsData, isAdmin: boolean): string {
  const active = stats.totalActiveJobs
  const attention =
    (stats.overdueCount ?? 0)
    + (stats.dueTodayCount ?? 0)
    + (stats.checking ?? 0)
    + (stats.clientsOnHold ?? 0)
  const invoicing = isAdmin ? (stats.readyForInvoicingCount ?? 0) : 0
  const overdue = stats.overdueCount ?? 0

  if (overdue > 0) {
    const parts = [
      `${overdue} overdue job${overdue === 1 ? "" : "s"} need${overdue === 1 ? "s" : ""} attention`,
      `${active} active`,
    ]
    if (isAdmin && invoicing > 0) parts.push(`${invoicing} ready for invoicing`)
    return `Attention required. ${parts.join(", ")}.`
  }

  if (attention > 0) {
    const parts = [
      `${active} job${active === 1 ? "" : "s"} active`,
      `${attention} require${attention === 1 ? "s" : ""} attention`,
    ]
    if (isAdmin && invoicing > 0) parts.push(`${invoicing} ready for invoicing`)
    return `Oryx is operating with items to review. ${parts.join(", ")}.`
  }

  if (isAdmin && invoicing > 0) {
    return `Oryx is operating normally. ${active} jobs are active and ${invoicing} ${invoicing === 1 ? "is" : "are"} ready for invoicing.`
  }

  return `Oryx is operating normally. ${active} job${active === 1 ? " is" : "s are"} active with nothing overdue.`
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  sub,
  tone = "neutral",
  suffix,
}: {
  icon: React.ElementType
  label: string
  value: number
  href?: string
  sub?: string
  tone?: "neutral" | "attention" | "danger" | "success"
  suffix?: string
}) {
  const iconClass = {
    neutral: "text-t3 bg-pg",
    attention: "text-wn bg-wn-bg",
    danger: "text-dn bg-dn-bg",
    success: "text-ok-ic bg-ok-bg",
  }[tone]

  const inner = (
    <div className="group h-full rounded-xl border border-bd bg-sr p-5 transition-all duration-150 hover:border-bds hover:bg-surface-low/40 max-md:p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={cn("rounded-lg p-2", iconClass)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <ChevronRight className="h-4 w-4 text-t4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-t1 max-md:text-2xl">
        {value}{suffix ? <span className="ml-0.5 text-lg font-medium text-t3">{suffix}</span> : null}
      </p>
      <p className="mt-2 text-sm font-medium text-t1">{label}</p>
      {sub && <p className="mt-1 text-xs text-t3">{sub}</p>}
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20 rounded-xl">
      {inner}
    </Link>
  ) : inner
}

function Panel({
  title,
  count,
  viewAllHref,
  viewAllLabel,
  children,
  className,
}: {
  title: string
  count?: number
  viewAllHref?: string
  viewAllLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex min-h-56 flex-col overflow-hidden rounded-xl border border-bd bg-sr", className)}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-semibold text-t1">{title}</h2>
          {count != null && count > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-pg px-1.5 text-[11px] font-semibold tabular-nums text-t2">
              {count}
            </span>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-t3 transition-colors hover:text-t1"
          >
            {viewAllLabel ?? "View all"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="flex flex-1 flex-col border-t border-bd">{children}</div>
    </section>
  )
}

function PanelEmpty({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10">
      <Icon className="h-5 w-5 text-t4" aria-hidden />
      <p className="text-center text-sm text-t3">{message}</p>
    </div>
  )
}

function QuickCreateMenu() {
  const router = useRouter()
  const { canAccess } = useUser()

  const items = [
    canAccess("jobs") && { label: "New job", href: "/jobs?new=1" },
    canAccess("quotes") && { label: "New quote", href: "/quotes?new=1" },
    canAccess("clients") && { label: "New client", href: "/clients?new=1" },
    canAccess("calendar") && { label: "Book site visit", href: "/calendar?new=site-visit" },
  ].filter(Boolean) as { label: string; href: string }[]

  if (!items.length) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {items.map((item, i) => (
          <div key={item.href}>
            {i === 3 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => router.push(item.href)}>
              {item.label}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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

  const { data: activityData } = useApi<ActivityResponse>("/api/activity?limit=12")

  const events: DashboardWeekEvent[] = stats?.weekEvents ?? []
  const overdueJobs: Job[] = stats?.overdueJobs ?? []
  const holds: ClientHoldWithClient[] = (stats?.holds ?? []).slice(0, 5)
  const activity = activityData?.items ?? []
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load dashboard data") : null

  const siteVisits = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)

  const statusTotal = (stats?.byStatus ?? []).reduce((a, b) => a + b.count, 0)
  const progressRows = JOB_STATUSES.map(s => ({
    ...s,
    count: stats?.byStatus?.find(x => x.status === s.value)?.count ?? 0,
  }))

  const now = new Date()
  const todayLabel = format(now, "EEEE d MMMM yyyy")
  const summary = stats ? buildOperationalSummary(stats, isAdmin) : null

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
        <div className="grid grid-cols-12 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="col-span-6 h-32 rounded-xl skeleton lg:col-span-3" />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-6" />
          <div className="col-span-12 h-56 rounded-xl skeleton lg:col-span-6" />
        </div>
      </div>
    )
  }

  const dueWeek = stats?.dueThisWeekCount ?? 0
  const checking = stats?.checking ?? 0
  const invoicing = stats?.readyForInvoicingCount ?? 0
  const overdueCount = stats?.overdueCount ?? 0

  return (
    <div className="space-y-8">
      {/* Operational overview */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-3xl space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-t1 max-md:text-xl">
              {greetingForHour(now.getHours())}, {displayName}
            </h1>
            <p className="mt-1 text-sm text-t3">{todayLabel}</p>
          </div>
          <p className="text-sm text-t2">Here&apos;s what&apos;s happening across Oryx today.</p>
          {summary && (
            <p className="rounded-lg border border-bd bg-sr px-4 py-3 text-sm leading-relaxed text-t2">
              {summary}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <QuickCreateMenu />
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 lg:col-span-3">
          <StatCard
            icon={Briefcase}
            label="Active jobs"
            value={stats?.totalActiveJobs ?? 0}
            href="/jobs"
            sub={`${stats?.totalRevisions ?? 0} revisions in flight`}
            tone="neutral"
          />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard
            icon={Clock}
            label="Due this week"
            value={dueWeek}
            href="/jobs?deadline=this_week"
            sub={stats?.dueTodayCount ? `${stats.dueTodayCount} due today` : "Nothing due today"}
            tone={dueWeek > 0 ? "attention" : "neutral"}
          />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard
            icon={ClipboardCheck}
            label="Requires checking"
            value={checking}
            href="/jobs/checking"
            sub={checking > 0 ? "Waiting for review" : "Checking queue clear"}
            tone={checking > 0 ? "attention" : "neutral"}
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
              tone={invoicing > 0 ? "success" : "neutral"}
            />
          ) : (
            <StatCard
              icon={AlertOctagon}
              label="Overdue"
              value={overdueCount}
              href="/jobs?deadline=overdue"
              sub={overdueCount > 0 ? "Needs immediate attention" : "Nothing overdue"}
              tone={overdueCount > 0 ? "danger" : "neutral"}
            />
          )}
        </div>
      </div>

      {/* Needs attention */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <Panel title="Overdue jobs" count={stats?.overdueCount} viewAllHref="/jobs?deadline=overdue">
            {overdueJobs.length === 0 ? (
              <PanelEmpty icon={CheckCircle2} message="Nothing overdue — operations are on track." />
            ) : (
              <ul className="divide-y divide-bd">
                {overdueJobs.map(job => {
                  const dl = getDeadlineInfo(job.requiredByDate)
                  return (
                    <li key={job.id}>
                      <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-low">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <RevisionFamilyBadge job={job} size="xs" />
                            <span className="font-mono text-xs font-semibold text-t1">{job.drawingNumber}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-t3">{job.address}</p>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-dn">{dl.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <Panel title="Clients on hold" count={stats?.clientsOnHold} viewAllHref="/clients/hold-list">
            {holds.length === 0 ? (
              <PanelEmpty icon={CheckCircle2} message="No clients are currently on hold." />
            ) : (
              <ul className="divide-y divide-bd">
                {holds.map(hold => (
                  <li key={hold.id}>
                    <Link href={`/clients/${hold.clientId}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-low">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-t1">{hold.clientName}</p>
                        <p className="mt-0.5 truncate text-xs text-t3">{hold.reason}</p>
                      </div>
                      <AlertTriangle className="h-4 w-4 shrink-0 text-wn" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Upcoming */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <Panel title="Upcoming site visits" count={siteVisits.length} viewAllHref="/calendar" viewAllLabel="View calendar">
            {siteVisits.length === 0 ? (
              <PanelEmpty icon={MapPin} message="No site visits scheduled this week." />
            ) : (
              <ul className="divide-y divide-bd">
                {siteVisits.slice(0, 5).map(e => (
                  <li key={e.id} className="px-5 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs tabular-nums text-t3">{format(new Date(e.startDate), "EEE d MMM")}</span>
                      {!e.allDay && (
                        <span className="text-xs tabular-nums text-t3">{e.startDate.slice(11, 16)}</span>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-t1">{e.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {e.assignees[0] && <span className="text-xs text-t3">{e.assignees[0].userName}</span>}
                      {e.jobDrawingNumber && e.jobId && (
                        <Link href={`/jobs/${e.jobId}`} className="font-mono text-xs font-medium text-t2 hover:text-t1 hover:underline">
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
          <Panel title="Upcoming meetings" count={teamsMeetings.length} viewAllHref="/calendar" viewAllLabel="View calendar">
            {teamsMeetings.length === 0 ? (
              <PanelEmpty icon={Video} message="No meetings scheduled this week." />
            ) : (
              <ul className="divide-y divide-bd">
                {teamsMeetings.slice(0, 5).map(e => (
                  <li key={e.id} className="px-5 py-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs tabular-nums text-t3">{format(new Date(e.startDate), "EEE d MMM")}</span>
                      {!e.allDay && (
                        <span className="text-xs tabular-nums text-t3">
                          {e.startDate.slice(11, 16)} – {e.endDate.slice(11, 16)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-t1">{e.title}</p>
                    {e.assignees.length > 0 && (
                      <p className="mt-1 text-xs text-t3">{e.assignees.map(a => a.userName).join(", ")}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Activity + progress (+ finance for admin) */}
      <div className="grid grid-cols-12 gap-4">
        <div className={cn("col-span-12", isAdmin ? "lg:col-span-5" : "lg:col-span-7")}>
          <Panel title="Recent activity" count={activity.length} viewAllHref="/jobs" viewAllLabel="View jobs">
            {activity.length === 0 ? (
              <PanelEmpty icon={Activity} message="No recent status changes to show." />
            ) : (
              <ul className="divide-y divide-bd">
                {activity.map(item => {
                  let when = item.changedAt.slice(0, 10)
                  try {
                    when = formatDistanceToNow(new Date(item.changedAt), { addSuffix: true })
                  } catch { /* keep fallback */ }
                  const summary = item.fromLabel
                    ? `${item.fromLabel} → ${item.toLabel}`
                    : item.toLabel
                  const row = (
                    <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-low">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-t1">
                          {item.drawingNumber && (
                            <span className="mr-1.5 font-mono text-xs font-semibold">{item.drawingNumber}</span>
                          )}
                          {summary}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-t3">
                          {[item.changedBy, item.note].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] tabular-nums text-t4">{when}</span>
                    </div>
                  )
                  return (
                    <li key={item.id}>
                      {item.href ? <Link href={item.href}>{row}</Link> : row}
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className={cn("col-span-12", isAdmin ? "lg:col-span-4" : "lg:col-span-5")}>
          <Panel title="Job progress" viewAllHref="/jobs">
            {statusTotal === 0 ? (
              <PanelEmpty icon={BarChart3} message="No active jobs to chart yet." />
            ) : (
              <div className="space-y-4 px-5 py-5">
                {progressRows.map(row => {
                  const pct = statusTotal > 0 ? Math.round((row.count / statusTotal) * 100) : 0
                  return (
                    <div key={row.value}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-t2">{row.label}</span>
                        <span className="text-xs tabular-nums text-t3">{row.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-pg" role="presentation">
                        <div
                          className="h-full rounded-full bg-t2/50 transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>

        {isAdmin && (
          <div className="col-span-12 lg:col-span-3">
            <Panel title="Financial snapshot" viewAllHref="/billing" viewAllLabel="Billing">
              <div className="space-y-4 px-5 py-5">
                <div>
                  <p className="text-xs text-t3">Ready for invoicing</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-t1">{invoicing}</p>
                  <p className="mt-0.5 text-xs text-t3">
                    {stats?.readyForInvoicingValue != null
                      ? formatGBP(stats.readyForInvoicingValue)
                      : "Queue value pending"}
                  </p>
                </div>
                <div className="h-px bg-bd" />
                <div>
                  <p className="text-xs text-t3">Quotes won</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-t1">
                    {stats?.quotesWonValue != null ? formatGBP(stats.quotesWonValue) : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-t3">
                    {Math.round((stats?.quotesConversionRate ?? 0) * 100)}% win rate · {stats?.quotesAccepted ?? 0} accepted
                  </p>
                </div>
                <div className="h-px bg-bd" />
                <div className="flex items-center gap-2 text-xs text-t3">
                  <PoundSterling className="h-3.5 w-3.5" aria-hidden />
                  Admin-only commercial view
                </div>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
