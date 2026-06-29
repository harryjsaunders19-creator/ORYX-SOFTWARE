"use client"
import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { format, startOfWeek, endOfWeek } from "date-fns"
import {
  MapPin, Video, Receipt, Briefcase,
  AlertOctagon, ClipboardCheck, AlertTriangle, Clock,
} from "lucide-react"
import { useUser } from "@/components/user-context"
import { cn, getDeadlineInfo } from "@/lib/utils"
import { apiErrorDetail } from "@/lib/error-message"
import type { StatsData, Job, ClientHoldWithClient } from "@/lib/types"

const SITE_VISIT_ID = "cat_site_visit"
const TEAMS_MEETING_ID = "cat_teams_meeting"

interface CalEvent {
  id: string; title: string; startDate: string; endDate: string; allDay: number
  categoryId: string; categoryName: string; categoryColor: string
  location: string | null; jobId: string | null; jobDrawingNumber: string | null
  clientName: string | null
  assignees: { userId: string; userName: string }[]
}

// ── Reusable pieces ─────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, accent, href }: {
  icon: React.ElementType; label: string; value: number; accent: string; href?: string
}) {
  const inner = (
    <div className="group relative glass-card border border-bd rounded-2xl shadow-card p-6 overflow-hidden hover:shadow-lg transition-all h-full">
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: accent }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[40px] font-bold tabular-nums text-t1 leading-none tracking-tight">{value}</p>
          <p className="text-xs font-semibold text-t3 uppercase tracking-wider mt-3">{label}</p>
        </div>
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: accent + "18" }}
        >
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
      </div>
    </div>
  )
  return href ? <Link href={href} className="block">{inner}</Link> : inner
}

function SectionHeader({ icon: Icon, accent, title, count, viewAllHref, viewAllLabel }: {
  icon: React.ElementType; accent: string; title: string; count?: number; viewAllHref: string; viewAllLabel?: string
}) {
  return (
    <div className="px-4 py-3 border-b border-bd flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", accent)} />
        <p className="text-sm font-semibold text-t1">{title}</p>
        {count != null && count > 0 && (
          <span className="text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center bg-pg text-t2 shrink-0">{count}</span>
        )}
      </div>
      <Link href={viewAllHref} className="text-xs text-ac hover:text-ach font-medium shrink-0">{viewAllLabel ?? "View all →"}</Link>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────

export function DashboardStats() {
  const { isAdmin } = useUser()

  const [stats, setStats]               = useState<StatsData | null>(null)
  const [events, setEvents]             = useState<CalEvent[]>([])
  const [overdueJobs, setOverdueJobs]   = useState<Job[]>([])
  const [holds, setHolds]               = useState<ClientHoldWithClient[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  const today     = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(today, { weekStartsOn: 1 })
  const fromStr   = format(weekStart, "yyyy-MM-dd")
  const toStr     = format(weekEnd, "yyyy-MM-dd")

  const loadAll = useCallback(() => {
    setError(null)
    Promise.all([
      fetch("/api/stats").then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => null)
          throw new Error(apiErrorDetail(body, r.status))
        }
        return r.json() as Promise<StatsData>
      }),
      fetch(`/api/calendar/events?from=${fromStr}&to=${toStr}`).then(r => r.ok ? r.json() as Promise<{ events: CalEvent[] }> : null),
      fetch("/api/jobs?overdue=true&limit=5&sortBy=requiredByDate&sortDir=asc").then(r => r.ok ? r.json() as Promise<{ jobs: Job[] }> : null),
    ])
      .then(([s, e, ov]) => {
        setStats(s)
        setHolds((s.holds ?? []).slice(0, 5))
        if (e) setEvents(e.events)
        if (ov) setOverdueJobs(ov.jobs)
      })
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load dashboard data"))
      .finally(() => setLoading(false))
  }, [fromStr, toStr])

  useEffect(() => { loadAll() }, [loadAll])

  const siteVisits    = events.filter(e => e.categoryId === SITE_VISIT_ID)
  const teamsMeetings = events.filter(e => e.categoryId === TEAMS_MEETING_ID)

  if (error) return (
    <div className="bg-dn-bg border border-dn-bd rounded-md p-4 text-sm text-dn-tx space-y-2">
      <p className="font-medium">Failed to load dashboard data.</p>
      <p className="text-xs text-t3">{error}</p>
    </div>
  )
  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="col-span-6 lg:col-span-3 h-28 rounded-2xl skeleton" />)}</div>
      <div className="grid grid-cols-12 gap-4"><div className="col-span-12 lg:col-span-6 h-52 rounded-2xl skeleton" /><div className="col-span-12 lg:col-span-6 h-52 rounded-2xl skeleton" /></div>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── KPI bento (12-col) ─────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 lg:col-span-3">
          <StatCard icon={Briefcase} label="Active Jobs" value={stats?.totalActiveJobs ?? 0} accent="#4640DE" href="/jobs" />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard icon={Clock} label="Due This Week" value={stats?.dueThisWeekCount ?? 0} accent="#B45309" href="/jobs?deadline=this_week" />
        </div>
        <div className="col-span-6 lg:col-span-3">
          <StatCard icon={ClipboardCheck} label="Requires Checking" value={stats?.checking ?? 0} accent="#CA8A04" href="/jobs/checking" />
        </div>
        {isAdmin ? (
          <div className="col-span-6 lg:col-span-3">
            <StatCard icon={Receipt} label="Ready For Invoicing" value={stats?.readyForInvoicingCount ?? 0} accent="#0E7A6E" href="/billing" />
          </div>
        ) : (
          <div className="col-span-6 lg:col-span-3 hidden lg:block" aria-hidden />
        )}
      </div>

      {/* ── Needs Attention ───────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 bg-sr border border-bd rounded-2xl shadow-card overflow-hidden">
          <SectionHeader icon={AlertOctagon} accent="text-dn" title="Overdue" count={stats?.overdueCount} viewAllHref="/jobs?deadline=overdue" />
          {overdueJobs.length === 0 ? (
            <p className="px-4 py-6 text-xs text-t4 text-center">Nothing overdue — good shape.</p>
          ) : (
            <div className="divide-y divide-bd">
              {overdueJobs.map(job => {
                const dl = getDeadlineInfo(job.requiredByDate)
                return (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-low">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[11px] font-semibold text-ac">{job.drawingNumber}</span>
                      <p className="text-[11px] text-t3 truncate mt-0.5">{job.address}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-dn-tx shrink-0">{dl.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        <div className="col-span-12 lg:col-span-6 bg-sr border border-bd rounded-2xl shadow-card overflow-hidden">
          <SectionHeader icon={AlertTriangle} accent="text-dn" title="Clients On Hold" count={stats?.clientsOnHold} viewAllHref="/clients/hold-list" />
          {holds.length === 0 ? (
            <p className="px-4 py-6 text-xs text-t4 text-center">No clients on hold.</p>
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
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 bg-sr border border-bd rounded-2xl shadow-card overflow-hidden">
          <SectionHeader icon={MapPin} accent="text-[#3B82F6]" title="Upcoming Site Visits" count={siteVisits.length} viewAllHref="/calendar" viewAllLabel="View calendar →" />
          {siteVisits.length === 0 ? (
            <p className="px-4 py-7 text-xs text-t4 text-center">No site visits scheduled this week</p>
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

        <div className="col-span-12 lg:col-span-6 bg-sr border border-bd rounded-2xl shadow-card overflow-hidden">
          <SectionHeader icon={Video} accent="text-[#A855F7]" title="Upcoming Meetings" count={teamsMeetings.length} viewAllHref="/calendar" viewAllLabel="View calendar →" />
          {teamsMeetings.length === 0 ? (
            <p className="px-4 py-7 text-xs text-t4 text-center">No meetings scheduled this week</p>
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
    </div>
  )
}
