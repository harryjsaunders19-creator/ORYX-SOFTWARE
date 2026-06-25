"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertOctagon, Clock, ClipboardCheck, Receipt, AlertTriangle, ArrowRight,
} from "lucide-react"
import { useUser } from "@/components/user-context"
import { cn, formatGBP, getDeadlineInfo } from "@/lib/utils"
import type { StatsData, Job, ClientHoldWithClient, BillingHandoff } from "@/lib/types"

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-72 rounded skeleton" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-48 rounded border border-bd skeleton" />)}
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-t1 mb-1">No jobs yet</p>
      <p className="text-xs text-t3 mb-4">Create your first job to see the dashboard.</p>
      <Link href="/jobs" className="text-sm text-ac hover:text-ach font-medium">
        Go to jobs <ArrowRight className="inline h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

/** Thin, low-emphasis context strip — counts only, no cards. The actionable sections below
 *  are the point of the page; this is just enough orientation to know the overall scale. */
function GlanceStat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const content = (
    <>
      <span className="text-sm font-semibold tabular-nums text-t1">{value}</span>
      <span className="text-xs text-t3">{label}</span>
    </>
  )
  if (!href) {
    return <span className="flex items-baseline gap-1.5 shrink-0">{content}</span>
  }
  return (
    <Link href={href} className="flex items-baseline gap-1.5 hover:opacity-70 shrink-0">
      {content}
    </Link>
  )
}

/** Shell for every actionable section — icon, title, live count, "View all", and a row list
 *  (or an empty state when there's genuinely nothing to act on, which is itself good news). */
function Section({ icon: Icon, accent, title, count, viewAllHref, isEmpty, emptyText, children }: {
  icon: React.ElementType; accent: string; title: string; count: number; viewAllHref: string
  isEmpty: boolean; emptyText: string; children: React.ReactNode
}) {
  return (
    <div className="bg-sr border border-bd rounded-md overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-bd flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4 shrink-0", accent)} />
          <p className="text-sm font-semibold text-t1">{title}</p>
          {count > 0 && (
            <span className="text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1 flex items-center justify-center bg-pg text-t2 shrink-0">
              {count}
            </span>
          )}
        </div>
        <Link href={viewAllHref} className="text-xs text-ac hover:text-ach font-medium shrink-0">
          View all →
        </Link>
      </div>
      {isEmpty ? (
        <p className="px-4 py-7 text-xs text-t4 text-center">{emptyText}</p>
      ) : (
        <div className="divide-y divide-bd">{children}</div>
      )}
    </div>
  )
}

export function DashboardStats() {
  const { isAdmin } = useUser()
  const [stats,      setStats]      = useState<StatsData | null>(null)
  const [error,      setError]      = useState(false)

  const [overdueJobs,     setOverdueJobs]     = useState<Job[]>([])
  const [dueThisWeekJobs, setDueThisWeekJobs] = useState<Job[]>([])
  const [checkingJobs,    setCheckingJobs]    = useState<Job[]>([])
  const [readyForInvoicing, setReadyForInvoicing] = useState<BillingHandoff[]>([])
  const [holds,           setHolds]           = useState<ClientHoldWithClient[]>([])

  const load = () =>
    fetch("/api/stats")
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<StatsData> })
      .then(setStats)
      .catch(() => setError(true))

  const loadOverdue = () =>
    fetch("/api/jobs?overdue=true&limit=6&sortBy=requiredByDate&sortDir=asc")
      .then(r => r.json() as Promise<{ jobs: Job[] }>).then(d => setOverdueJobs(d.jobs)).catch(() => {})

  const loadDueThisWeek = () =>
    fetch("/api/jobs?dueThisWeek=true&limit=6&sortBy=requiredByDate&sortDir=asc")
      .then(r => r.json() as Promise<{ jobs: Job[] }>).then(d => setDueThisWeekJobs(d.jobs)).catch(() => {})

  const loadChecking = () =>
    fetch("/api/jobs?status=CHECKING&limit=6&sortBy=dateCreated&sortDir=asc")
      .then(r => r.json() as Promise<{ jobs: Job[] }>).then(d => setCheckingJobs(d.jobs)).catch(() => {})

  const loadReadyForInvoicing = () =>
    fetch("/api/billing-handoffs?view=awaiting&limit=6")
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<{ handoffs: BillingHandoff[] }> })
      .then(d => setReadyForInvoicing(d.handoffs))
      .catch(() => {})

  const loadHolds = () =>
    fetch("/api/hold-list")
      .then(r => r.json() as Promise<{ holds: ClientHoldWithClient[] }>)
      .then(d => setHolds(d.holds.slice(0, 6)))
      .catch(() => {})

  useEffect(() => {
    load(); loadOverdue(); loadDueThisWeek(); loadChecking(); loadHolds()
    if (isAdmin) loadReadyForInvoicing()
  }, [isAdmin])

  if (error) return (
    <div className="bg-sr border border-bd rounded-md p-4 text-sm text-dn">
      Failed to load dashboard data.
    </div>
  )
  if (!stats) return <Skeleton />
  if (stats.total === 0) return <Empty />

  return (
    <>
      <div className="space-y-5">
        {/* At a glance — orientation only, not the point of the page */}
        <div className="flex items-center gap-4 flex-wrap pb-1">
          <GlanceStat label="active jobs"  value={stats.totalActiveJobs} href="/jobs?onlyOriginals=true" />
          <span className="h-3 w-px bg-bd" />
          <GlanceStat label="revisions"    value={stats.totalRevisions}  href="/jobs?onlyRevisions=true" />
          {isAdmin && stats.totalQuotedValue != null && stats.totalQuotedValue > 0 && (
            <>
              <span className="h-3 w-px bg-bd" />
              <GlanceStat label="total quoted" value={formatGBP(stats.totalQuotedValue)} />
            </>
          )}
          {isAdmin && stats.totalIssuedValue != null && stats.totalIssuedValue > 0 && (
            <>
              <span className="h-3 w-px bg-bd" />
              <GlanceStat label="total issued" value={formatGBP(stats.totalIssuedValue)} />
            </>
          )}
        </div>

        {/* Actionable sections — what needs attention today, not generic statistics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section
            icon={AlertOctagon} accent="text-dn" title="Overdue Jobs"
            count={stats.overdueCount} viewAllHref="/jobs?deadline=overdue"
            isEmpty={overdueJobs.length === 0} emptyText="Nothing overdue — good shape."
          >
            {overdueJobs.map(job => {
              const dl = getDeadlineInfo(job.requiredByDate)
              return (
                <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-ac shrink-0">{job.drawingNumber}</span>
                      <span className="text-xs text-t2 truncate">{job.address}</span>
                    </div>
                    <p className="text-[11px] text-t4 mt-0.5 truncate">{job.clientCompany}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-dn-tx shrink-0 whitespace-nowrap">{dl.label}</span>
                </Link>
              )
            })}
          </Section>

          <Section
            icon={Clock} accent="text-wn" title="Jobs Due This Week"
            count={stats.dueThisWeekCount} viewAllHref="/jobs?deadline=this_week"
            isEmpty={dueThisWeekJobs.length === 0} emptyText="Nothing due in the next 7 days."
          >
            {dueThisWeekJobs.map(job => {
              const dl = getDeadlineInfo(job.requiredByDate)
              return (
                <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-ac shrink-0">{job.drawingNumber}</span>
                      <span className="text-xs text-t2 truncate">{job.address}</span>
                    </div>
                    <p className="text-[11px] text-t4 mt-0.5 truncate">{job.clientCompany}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-wn-tx shrink-0 whitespace-nowrap">{dl.label}</span>
                </Link>
              )
            })}
          </Section>

          <Section
            icon={ClipboardCheck} accent="text-wn" title="Requires Checking"
            count={stats.checking} viewAllHref="/jobs?status=CHECKING"
            isEmpty={checkingJobs.length === 0} emptyText="Nothing in technical review."
          >
            {checkingJobs.map(job => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-semibold text-ac shrink-0">{job.drawingNumber}</span>
                    <span className="text-xs text-t2 truncate">{job.address}</span>
                  </div>
                  <p className="text-[11px] text-t4 mt-0.5 truncate">{job.clientCompany}</p>
                </div>
                <span className="text-[11px] text-t3 shrink-0 whitespace-nowrap">
                  {job.designer || <span className="italic text-t4">Unassigned</span>}
                </span>
              </Link>
            ))}
          </Section>

          {isAdmin && (
            <Section
              icon={Receipt} accent="text-ac2" title="Ready For Invoicing"
              count={stats.readyForInvoicingCount ?? 0} viewAllHref="/billing"
              isEmpty={readyForInvoicing.length === 0} emptyText="Nothing awaiting accounts action."
            >
              {readyForInvoicing.map(item => (
                <Link key={item.id} href={`/jobs/${item.sourceJobId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-semibold text-ac shrink-0">{item.drawingNumber}</span>
                      <span className="text-xs text-t2 truncate">{item.clientCompany}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-t2 tabular-nums shrink-0">
                    {item.quoteValue != null ? formatGBP(item.quoteValue) : "—"}
                  </span>
                </Link>
              ))}
            </Section>
          )}

          <Section
            icon={AlertTriangle} accent="text-dn" title="Clients On Hold"
            count={stats.clientsOnHold} viewAllHref="/clients/hold-list"
            isEmpty={holds.length === 0} emptyText="No clients currently on hold."
          >
            {holds.map(hold => (
              <Link key={hold.id} href={`/clients/${hold.clientId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pg">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-t1 truncate">{hold.clientName}</p>
                  <p className="text-[11px] text-t4 mt-0.5 truncate">{hold.reason}</p>
                </div>
                {hold.activeJobCount > 0 && (
                  <span className="text-[11px] font-semibold text-dn-tx shrink-0 whitespace-nowrap">
                    {hold.activeJobCount} active
                  </span>
                )}
              </Link>
            ))}
          </Section>

        </div>
      </div>
    </>
  )
}
