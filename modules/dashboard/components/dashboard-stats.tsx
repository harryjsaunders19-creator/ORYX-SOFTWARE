"use client"
import { useMemo } from "react"
import Link from "next/link"
import { format, formatDistanceToNow, startOfWeek, endOfWeek } from "date-fns"
import { RevisionFamilyBadge } from "@/components/revision-family-badge"
import {
  MapPin, Video, Receipt, Briefcase, Send, Percent, Activity,
  AlertOctagon, ClipboardCheck, AlertTriangle, Clock, RefreshCw, ChevronRight,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useUser } from "@/shared/providers/user-context"
import { cn, getDeadlineInfo } from "@/shared/utils/utils"
// Perf: SWR via useApi dedupes/caches /api/stats across revisits (2s dedupe window).
import { useApi } from "@/shared/hooks/use-api"
import type { StatsData, DashboardWeekEvent } from "../types/stats-types"
import type { ActivityResponse } from "../types/activity-types"
import type { Job, ClientHoldWithClient } from "@/lib/types"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

// ── Reusable pieces ─────────────────────────────────────────────────

/** Stitch dashboard KPI — accent top bar, large value, icon badge (ORYX semantic colours). */
function StatCard({ icon: Icon, label, value, href, accent, iconTint, suffix }: {
  icon: React.ElementType
  label: string
  value: number
  href?: string
  accent: string
  iconTint: string
  suffix?: string
}) {
  const inner = (
    <div className="oryx-surface-card group relative h-full overflow-hidden rounded-xl border border-bd bg-sr p-6 transition-shadow hover:shadow-md max-md:p-4">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accent }} />
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[48px] font-semibold tabular-nums leading-none tracking-tight text-t1 max-md:text-3xl">
          {value}{suffix ? <span className="text-2xl text-t3 max-md:text-lg">{suffix}</span> : null}
        </p>
        <div className="rounded-lg p-2 shrink-0" style={{ backgroundColor: `${iconTint}18` }}>
          <Icon className="h-5 w-5" style={{ color: iconTint }} />
        </div>
      </div>
      <p className="font-mono text-xs uppercase tracking-widest text-t3">{label}</p>
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

function SectionHeader({ icon: Icon, accent, title, count, viewAllHref, viewAllLabel }: {
  icon: React.ElementType; accent: string; title: string; count?: number; viewAllHref: string; viewAllLabel?: string
}) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-bd bg-sr px-5 py-3.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={cn("h-5 w-5 shrink-0", accent)} />
        <p className="text-sm font-semibold text-t1">{title}</p>
        {count != null && count > 0 && (
          <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-pg px-1.5 text-[11px] font-bold text-t2 tabular-nums">{count}</span>
        )}
      </div>
      <Link href={viewAllHref} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-ac hover:text-ach">
        {viewAllLabel ?? "View all"}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-8">
      <p className="text-center text-sm text-t3 italic opacity-70">{children}</p>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────

export function DashboardStats({
  statsKey: statsKeyProp,
  fallbackStats,
}: {
  statsKey?: string
  fallbackStats?: StatsData | null
} = {}) {
  const { isAdmin } = useUser()

  // Week bounds are calendar-day stable for the session; memoize so the SWR key is stable.
  const statsKey = useMemo(() => {
    if (statsKeyProp) return statsKeyProp
    const today     = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd   = endOfWeek(today, { weekStartsOn: 1 })
    const params = new URLSearchParams({
      calendarFrom: format(weekStart, "yyyy-MM-dd"),
      calendarTo: format(weekEnd, "yyyy-MM-dd"),
    })
    return `/api/stats?${params}`
  }, [statsKeyProp])

  const { data: stats, error: swrError, isLoading, mutate } = useApi<StatsData>(statsKey, {
    fallbackData: fallbackStats ?? undefined,
    // RSC already built this payload — don't immediately rebuild via /api/stats.
    ...(fallbackStats ? { revalidateIfStale: false, revalidateOnMount: false } : {}),
  })

  const { data: activityData } = useApi<ActivityResponse>("/api/activity?limit=12")

  const events: DashboardWeekEvent[] = stats?.weekEvents ?? []
  const overdueJobs: Job[] = stats?.overdueJobs ?? []
  const holds: ClientHoldWithClient[] = (stats?.holds ?? []).slice(0, 5)
  const activity = activityData?.items ?? []
  const error = swrError ? (swrError instanceof Error ? swrError.message : "Failed to load dashboard data") : null
  const conversionPct = Math.round((stats?.quotesConversionRate ?? 0) * 100)

  const siteVisits    = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)

  if (error) return (
    <div className="bg-dn-bg border border-dn-bd rounded-md p-4 text-sm text-dn-tx space-y-3">
      <p className="font-medium">Failed to load dashboard data.</p>
      <p className="text-xs text-t3">{error}</p>
      <Button variant="outline" size="sm" onClick={() => void mutate()}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  )
  if (isLoading && !stats) return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="col-span-6 lg:col-span-3 h-28 rounded-2xl skeleton" />)}</div>
      <div className="grid grid-cols-12 gap-4"><div className="col-span-12 lg:col-span-6 h-52 rounded-2xl skeleton" /><div className="col-span-12 lg:col-span-6 h-52 rounded-2xl skeleton" /></div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── KPI bento (12-col) ─────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-6 lg:col-span-3">
          <StatCard icon={Briefcase} label="Active Jobs" value={stats?.totalActiveJobs ?? 0} href="/jobs" accent="var(--color-rs)" iconTint="var(--color-rs)" />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard icon={Clock} label="Due Today" value={stats?.dueTodayCount ?? 0} href="/jobs?deadline=today" accent="var(--color-dn)" iconTint="var(--color-dn)" />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard icon={Send} label="Ready To Send" value={stats?.readyToSend ?? 0} href="/jobs?status=READY_TO_SEND" accent="var(--color-wn)" iconTint="var(--color-wn)" />
        </div>
        {isAdmin ? (
          <div className="col-span-6 lg:col-span-3">
            <StatCard icon={Receipt} label="Ready For Invoicing" value={stats?.readyForInvoicingCount ?? 0} href="/billing" accent="var(--color-ok-ic)" iconTint="var(--color-ok-ic)" />
          </div>
        ) : (
          <div className="col-span-6 lg:col-span-3">
            <StatCard icon={Percent} label="Quote Win Rate" value={conversionPct} suffix="%" href="/quotes" accent="var(--color-ac2)" iconTint="var(--color-ac2)" />
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-6 lg:col-span-3">
            <StatCard icon={ClipboardCheck} label="Requires Checking" value={stats?.checking ?? 0} href="/jobs/checking" accent="var(--color-wn)" iconTint="var(--color-wn)" />
          </div>
          <div className="col-span-6 lg:col-span-3">
            <StatCard icon={Percent} label="Quote Win Rate" value={conversionPct} suffix="%" href="/quotes" accent="var(--color-ac2)" iconTint="var(--color-ac2)" />
          </div>
          <div className="col-span-6 lg:col-span-3">
            <StatCard icon={Clock} label="Due This Week" value={stats?.dueThisWeekCount ?? 0} href="/jobs?deadline=this_week" accent="var(--color-rs)" iconTint="var(--color-rs)" />
          </div>
          <div className="col-span-6 lg:col-span-3 hidden lg:block" aria-hidden />
        </div>
      )}

      {/* ── Needs Attention ───────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6 oryx-surface-card flex min-h-64 flex-col overflow-hidden rounded-lg border border-bd bg-sr">
          <SectionHeader icon={AlertOctagon} accent="text-dn" title="Overdue" count={stats?.overdueCount} viewAllHref="/jobs?deadline=overdue" />
          {overdueJobs.length === 0 ? (
            <EmptyPanel>Nothing overdue — good shape.</EmptyPanel>
          ) : (
            <div className="divide-y divide-bd">
              {overdueJobs.map(job => {
                const dl = getDeadlineInfo(job.requiredByDate)
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-low">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <RevisionFamilyBadge job={job} size="xs" />
                        <span className="font-mono text-[11px] font-semibold text-ac">{job.drawingNumber}</span>
                      </div>
                      <p className="text-[11px] text-t3 truncate mt-0.5">{job.address}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-dn-tx shrink-0">{dl.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 oryx-surface-card flex min-h-64 flex-col overflow-hidden rounded-lg border border-bd bg-sr">
          <SectionHeader icon={AlertTriangle} accent="text-wn" title="Clients On Hold" count={stats?.clientsOnHold} viewAllHref="/clients/hold-list" />
          {holds.length === 0 ? (
            <EmptyPanel>No clients on hold.</EmptyPanel>
          ) : (
            <div className="divide-y divide-bd">
              {holds.map(hold => (
                <Link key={hold.id} href={`/clients/${hold.clientId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-low">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-t1 truncate">{hold.clientName}</p>
                    <p className="text-[11px] text-t4 truncate mt-0.5">{hold.reason}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Upcoming ──────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6 oryx-surface-card flex min-h-64 flex-col overflow-hidden rounded-lg border border-bd bg-sr">
          <SectionHeader icon={MapPin} accent="text-rs" title="Upcoming Site Visits" count={siteVisits.length} viewAllHref="/calendar" viewAllLabel="View calendar" />
          {siteVisits.length === 0 ? (
            <EmptyPanel>No site visits scheduled this week</EmptyPanel>
          ) : (
            <div className="divide-y divide-bd">
              {siteVisits.slice(0, 5).map(e => (
                <div key={e.id} className="px-4 py-2.5 hover:bg-pg/50">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-t4 tabular-nums">{format(new Date(e.startDate), "EEE d MMM")}</span>
                    {!e.allDay && <span className="text-[11px] text-t3 tabular-nums">{e.startDate.slice(11, 16)}</span>}
                  </div>
                  <p className="text-xs font-medium text-t1 truncate">{e.title}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {e.assignees.length > 0 && <span className="text-[11px] text-t3">{e.assignees[0].userName}</span>}
                    {e.jobDrawingNumber && (
                      <Link href={`/jobs/${e.jobId}`} className="text-[11px] font-mono font-semibold text-ac hover:underline">{e.jobDrawingNumber}</Link>
                    )}
                    {e.location && (
                      <span className="text-[11px] text-t4 flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{e.location}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 oryx-surface-card flex min-h-64 flex-col overflow-hidden rounded-lg border border-bd bg-sr">
          <SectionHeader icon={Video} accent="text-ac2" title="Upcoming Meetings" count={teamsMeetings.length} viewAllHref="/calendar" viewAllLabel="View calendar" />
          {teamsMeetings.length === 0 ? (
            <EmptyPanel>No meetings scheduled this week</EmptyPanel>
          ) : (
            <div className="divide-y divide-bd">
              {teamsMeetings.slice(0, 5).map(e => (
                <div key={e.id} className="px-4 py-2.5 hover:bg-pg/50">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] text-t4 tabular-nums">{format(new Date(e.startDate), "EEE d MMM")}</span>
                    {!e.allDay && <span className="text-[11px] text-t3 tabular-nums">{e.startDate.slice(11, 16)} – {e.endDate.slice(11, 16)}</span>}
                  </div>
                  <p className="text-xs font-medium text-t1 truncate">{e.title}</p>
                  {e.assignees.length > 0 && <span className="text-[11px] text-t3">{e.assignees.map(a => a.userName).join(", ")}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ───────────────────────────────────── */}
      <div className="oryx-surface-card flex min-h-64 flex-col overflow-hidden rounded-lg border border-bd bg-sr">
        <SectionHeader
          icon={Activity}
          accent="text-t2"
          title="Recent Activity"
          count={activity.length}
          viewAllHref="/jobs"
          viewAllLabel="View jobs"
        />
        {activity.length === 0 ? (
          <EmptyPanel>No recent status changes.</EmptyPanel>
        ) : (
          <div className="divide-y divide-bd">
            {activity.map(item => {
              const when = (() => {
                try {
                  return formatDistanceToNow(new Date(item.changedAt), { addSuffix: true })
                } catch {
                  return item.changedAt.slice(0, 10)
                }
              })()
              const summary = item.fromLabel
                ? `${item.fromLabel} → ${item.toLabel}`
                : item.toLabel
              const body = (
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-low">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.drawingNumber && (
                        <span className="font-mono text-[11px] font-semibold text-ac">{item.drawingNumber}</span>
                      )}
                      <span className="text-xs text-t1 truncate">{summary}</span>
                    </div>
                    <p className="text-[11px] text-t3 truncate mt-0.5">
                      {[item.changedBy, item.note].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="text-[10px] text-t4 shrink-0 tabular-nums">{when}</span>
                </div>
              )
              return item.href ? (
                <Link key={item.id} href={item.href}>{body}</Link>
              ) : (
                <div key={item.id}>{body}</div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
