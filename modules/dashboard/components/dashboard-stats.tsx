"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, startOfWeek, endOfWeek } from "date-fns"
import { RevisionFamilyBadge } from "@/modules/jobs/components/badges/revision-family-badge"
import {
  MapPin, Video, Receipt, Briefcase, Plus,
  ClipboardCheck, AlertTriangle, Clock, RefreshCw, ChevronRight,
  CheckCircle2, ExternalLink, AlertCircle,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu"
import { useUser } from "@/shared/providers/user-context"
import { cn, getJobDeadlineInfo } from "@/shared/utils/utils"
import { useApi } from "@/shared/hooks/use-api"
import { Typography } from "@/shared/design/typography"
import type { StatsData, DashboardWeekEvent } from "../types/stats-types"
import type { Job, ClientHoldWithClient } from "@/lib/types"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

/** KPI / legend colours — aligned with job-list status tokens. */
const TONE = {
  active: {
    accent: "var(--color-rs-ic)",
    icon: "text-rs-ic bg-rs-bg",
    badge: "bg-rs-bg text-rs-tx",
    dot: "bg-rs-ic",
  },
  due: {
    accent: "var(--color-wn-ic)",
    icon: "text-wn-ic bg-wn-bg",
    badge: "bg-wn-bg text-wn-tx",
    dot: "bg-wn-ic",
  },
  checking: {
    // Job-list CHECKING status
    accent: "var(--color-wn)",
    icon: "text-wn bg-wn-bg",
    badge: "bg-wn-bg text-wn-tx",
    dot: "bg-wn",
  },
  invoicing: {
    accent: "var(--color-ok-ic)",
    icon: "text-ok-ic bg-ok-bg",
    badge: "bg-ok-bg text-ok-tx",
    dot: "bg-ok-ic",
  },
  overdue: {
    accent: "var(--color-dn)",
    icon: "text-dn bg-dn-bg",
    badge: "bg-dn-bg text-dn-tx",
    dot: "bg-dn",
  },
} as const

type ToneKey = keyof typeof TONE

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  sub,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  href?: string
  sub?: string
  tone: ToneKey
}) {
  const t = TONE[tone]
  const inner = (
    <div className="group relative h-full overflow-hidden rounded-xl border border-bd bg-sr p-5 transition-all duration-150 hover:border-bds hover:shadow-sm max-md:p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: t.accent }} />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={cn("rounded-full p-2.5", t.icon)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <span className={cn(
          "inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 type-badge tabular-nums",
          t.badge,
        )}>
          {value}
        </span>
      </div>
      <p className={cn(Typography.Stat, "text-t1 max-md:text-[28px]")}>
        {value}
      </p>
      <p className={cn(Typography.Small, "mt-2 font-medium text-t1")}>{label}</p>
      {sub && <p className={cn(Typography.Helper, "mt-1 text-t3")}>{sub}</p>}
    </div>
  )
  return href ? (
    <Link
      href={href}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1/20"
    >
      {inner}
    </Link>
  ) : inner
}

function Panel({
  title,
  count,
  countTone,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string
  count?: number
  countTone?: ToneKey
  viewAllHref?: string
  viewAllLabel?: string
  children: React.ReactNode
}) {
  const badgeClass = countTone ? TONE[countTone].badge : "bg-pg text-t2"
  return (
    <section className="flex min-h-56 flex-col overflow-hidden rounded-xl border border-bd bg-sr shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={cn(Typography.CardTitle, "text-t1")}>{title}</h2>
          {count != null && count > 0 && (
            <span className={cn(
              Typography.Badge,
              "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 tabular-nums",
              badgeClass,
            )}>
              {count}
            </span>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className={cn(Typography.Helper, "inline-flex shrink-0 items-center gap-0.5 font-medium text-t3 transition-colors hover:text-t1")}
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
      <p className={cn(Typography.Small, "text-center text-t3")}>{message}</p>
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
        <Button size="sm" variant="primary" className="gap-1.5">
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

function LegendDot({ tone, label, value }: { tone: ToneKey; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-t2">
      <span className={cn("h-2 w-2 rounded-full", TONE[tone].dot)} aria-hidden />
      <span className="text-t3">{label}</span>
      <span className="font-semibold tabular-nums text-t1">{value}</span>
    </span>
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

  const events: DashboardWeekEvent[] = stats?.weekEvents ?? []
  const overdueJobs: Job[] = stats?.overdueJobs ?? []
  const holds: ClientHoldWithClient[] = (stats?.holds ?? []).slice(0, 5)
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load dashboard data") : null

  const siteVisits = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)

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
      {/* Greeting + New */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className={cn(Typography.PageTitle, "text-t1 max-md:text-[26px]")}>
            {greetingForHour(now.getHours())}, {displayName}
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
              Oryx is operating normally — {active} active job{active === 1 ? "" : "s"}, nothing overdue.
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

      {/* KPI row — Figma four-up */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 lg:col-span-3">
          <StatCard
            icon={Briefcase}
            label="Active jobs"
            value={active}
            href="/jobs"
            sub={`${stats?.totalRevisions ?? 0} revisions in flight`}
            tone="active"
          />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard
            icon={Clock}
            label="Due this week"
            value={dueWeek}
            href="/jobs?deadline=this_week"
            sub={stats?.dueTodayCount ? `${stats.dueTodayCount} due today` : "Nothing due today"}
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

      {/* Attention panels */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6">
          <Panel
            title="Overdue jobs"
            count={overdueCount}
            countTone="overdue"
            viewAllHref="/jobs?deadline=overdue"
          >
            {overdueJobs.length === 0 ? (
              <PanelEmpty icon={CheckCircle2} message="Nothing overdue — operations are on track." />
            ) : (
              <ul className="divide-y divide-bd">
                {overdueJobs.map(job => {
                  const dl = getJobDeadlineInfo(job)
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-low"
                      >
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE.overdue.dot)} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <RevisionFamilyBadge job={job} size="xs" />
                            <span className="font-mono text-xs font-semibold text-t1">{job.drawingNumber}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-t3">
                            {[job.clientCompany, job.address].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 type-badge",
                          TONE.overdue.badge,
                        )}>
                          {dl.label}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-t4" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-6">
          <Panel
            title="Clients on hold"
            count={stats?.clientsOnHold}
            countTone="due"
            viewAllHref="/clients/hold-list"
          >
            {holds.length === 0 ? (
              <PanelEmpty icon={CheckCircle2} message="No clients are currently on hold." />
            ) : (
              <ul className="divide-y divide-bd">
                {holds.map(hold => {
                  const initial = (hold.clientName?.trim()?.[0] ?? "?").toUpperCase()
                  return (
                    <li key={hold.id}>
                      <Link
                        href={`/clients/${hold.clientId}`}
                        className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-low"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pg text-xs font-semibold text-t2">
                          {initial}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-t1">{hold.clientName}</p>
                          <p className="mt-0.5 truncate text-xs text-t3">{hold.reason}</p>
                        </div>
                        <AlertTriangle className="h-4 w-4 shrink-0 text-wn-ic" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Upcoming */}
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
                          className="font-mono text-xs font-medium text-t2 hover:text-t1 hover:underline"
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
    </div>
  )
}
