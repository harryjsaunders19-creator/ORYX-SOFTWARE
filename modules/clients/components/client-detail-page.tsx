"use client"
import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { format } from "date-fns"
import { Mail, Phone, MapPin, FileText, AlertTriangle, ShieldOff, BarChart3, Plus } from "lucide-react"
import { Button }            from "@/shared/ui/button"
import { Input }             from "@/shared/ui/input"
import { Textarea }          from "@/shared/ui/textarea"
import { Label }             from "@/shared/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogBody } from "@/shared/ui/dialog"
import { StatusBadge }       from "@/modules/jobs/components/badges/status-badge"
import { WorkItemTypeBadge } from "@/modules/jobs/components/badges/work-item-type-badge"
import { RevisionFamilyBadge } from "@/modules/jobs/components/badges/revision-family-badge"
import { useToast }          from "@/shared/ui/toast"
import { useUser }           from "@/shared/providers/user-context"
import { cn, formatGBP } from "@/shared/utils/utils"
import { PageShell, BackLink, PageHeader, KpiTile, DataPanel, DetailPanel, surfaceCard } from "@/shared/layouts/page-layout"
// Perf: SWR caches client detail/hold/analytics across navigations.
import { useApi } from "@/shared/hooks/use-api"
import type { Client, ClientStats, ClientHold, Job } from "@/lib/types"
import type { ClientContactRow } from "@/modules/clients/types/client-contact-types"
import { CreateSiteDialog, SiteSummaryCard, SiteDetailsPanel } from "@/modules/sites/client"
import type { SiteSummary } from "@/modules/sites/client"

interface ClientDetail {
  client: Client
  contacts: ClientContactRow[]
  stats: ClientStats | null
  jobs: Job[]
}

interface ClientAnalytics {
  totalJobs: number; completed: number; inProgress: number; checking: number; readyToSend: number; newRequest: number
  completionRate: number; designs: number; revisions: number; siteVisits: number; surveys: number; inspections: number; catiiiDesignChecks: number
  totalQuoted: number; completedQuoted: number; avgCompletionDays: number | null
  timeline: { month: string; created: number; completed: number }[]
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <KpiTile label={label} value={value} accent="var(--color-ac)" />
}

export default function ClientDetailPage() {
  const { id }     = useParams() as { id: string }
  const router     = useRouter()
  const { toast }  = useToast()
  const [holdSaving, setHoldSaving] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [holdReason, setHoldReason] = useState("")
  const [holdNotes, setHoldNotes] = useState("")
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removeReason, setRemoveReason] = useState("")
  const [createSiteOpen, setCreateSiteOpen] = useState(false)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [siteFilterId, setSiteFilterId] = useState<string>("")
  const { isAdmin } = useUser()

  const { data: detail, error: detailError, isLoading } = useApi<ClientDetail>(
    id ? `/api/clients/${id}` : null,
  )
  const { data: holdData, mutate: mutateHold } = useApi<{ hold: ClientHold | null }>(
    id ? `/api/clients/${id}/hold` : null,
  )
  const { data: analytics } = useApi<ClientAnalytics>(
    id && isAdmin ? `/api/clients/${id}/analytics` : null,
  )
  const { data: sitesData, mutate: mutateSites } = useApi<{ sites: SiteSummary[] }>(
    id ? `/api/sites?clientId=${encodeURIComponent(id)}&activeOnly=false` : null,
  )
  const { data: siteDetail } = useApi<{
    site: SiteSummary
    jobs: Array<{ id: string; drawingNumber: string; status: string; typeOfWorks: string }>
  }>(selectedSiteId ? `/api/sites/${selectedSiteId}` : null)

  const hold = holdData?.hold ?? null
  const notFound = !!detailError && /404|Not found/i.test(detailError.message)
  const loading = isLoading && !detail

  const addToHold = async () => {
    if (!holdReason.trim()) return
    setHoldSaving(true)
    try {
      const res = await fetch(`/api/clients/${id}/hold`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: holdReason.trim(), notes: holdNotes.trim() || null }),
      })
      if (!res.ok) { toast("Failed to add hold", "error"); return }
      const h = await res.json() as ClientHold
      await mutateHold({ hold: h }, { revalidate: false })
      setHoldOpen(false); setHoldReason(""); setHoldNotes("")
      toast("Client placed on hold", "info")
    } catch { toast("Network error", "error") }
    finally { setHoldSaving(false) }
  }

  const removeFromHold = async () => {
    setHoldSaving(true)
    try {
      const res = await fetch(`/api/clients/${id}/hold`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removedReason: removeReason.trim() || null }),
      })
      if (!res.ok) { toast("Failed to remove hold", "error"); return }
      await mutateHold({ hold: null }, { revalidate: false })
      setRemoveOpen(false); setRemoveReason("")
      toast("Client removed from hold", "success")
    } catch { toast("Network error", "error") }
    finally { setHoldSaving(false) }
  }

  if (loading) return (
    <PageShell className="space-y-4">
      <div className="skeleton h-4 w-24 rounded" />
      <div className="skeleton h-7 w-64 rounded" />
      <div className="grid grid-cols-3 gap-3 mt-4">{[...Array(6)].map((_,i) => <div key={i} className="skeleton h-16 rounded" />)}</div>
    </PageShell>
  )

  if (notFound || !detail) return (
    <PageShell className="text-center py-20">
      <p className="text-sm text-t3">Client not found.</p>
      <Link href="/clients" className="text-sm text-ac mt-3 inline-block">← Back to clients</Link>
    </PageShell>
  )

  const { client, contacts = [], stats, jobs } = detail
  // One card per drawing — hide revision rows from client job tables.
  const parentJobs = jobs.filter(j => !j.parentJobId)
  const managedSiteJobs = parentJobs.filter(j => j.siteId)
  const oneOffJobs = parentJobs.filter(j => !j.siteId)
  const filteredBySite = siteFilterId
    ? parentJobs.filter(j => j.siteId === siteFilterId)
    : parentJobs
  const designJobs     = filteredBySite.filter(j => j.itemType === "DESIGN" || !j.itemType || j.itemType === "REVISION")
  const nonDesignJobs  = filteredBySite.filter(j => j.itemType && !["DESIGN","REVISION"].includes(j.itemType))
  const revisionCount  = jobs.filter(j => j.parentJobId || j.itemType === "REVISION").length
  const sites = sitesData?.sites ?? []
  const oneOffDesign = oneOffJobs.filter(j => j.itemType === "DESIGN" || !j.itemType || j.itemType === "REVISION")
  const oneOffOther = oneOffJobs.filter(j => j.itemType && !["DESIGN","REVISION"].includes(j.itemType))

  return (
    <PageShell>
      <BackLink href="/clients">All clients</BackLink>

      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap gap-4">
            {contacts.length > 0 ? (
              contacts.map((contact, index) => (
                <span key={contact.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {contact.name}
                    {contact.role ? ` · ${contact.role}` : ""}
                    {index === 0 && contacts.length > 1 ? " (primary)" : ""}
                  </span>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-ac hover:text-ach">
                      <Mail className="h-3.5 w-3.5" />{contact.email}
                    </a>
                  )}
                  {contact.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />{contact.phone}
                    </span>
                  )}
                </span>
              ))
            ) : (
              <>
                {client.contactName && <span>{client.contactName}</span>}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-ac hover:text-ach">
                    <Mail className="h-3.5 w-3.5" />{client.email}
                  </a>
                )}
                {client.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{client.phone}</span>}
              </>
            )}
            {client.billingAddress && (
              <span className="flex items-center gap-1 w-full sm:w-auto">
                <MapPin className="h-3.5 w-3.5" />{client.billingAddress}
              </span>
            )}
          </span>
        }
        actions={
          <>
            {!client.active && (
              <span className="type-helper bg-t1/[0.06] text-t3 rounded-full px-2.5 py-0.5">Archived</span>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push(`/clients`)}>
              All clients
            </Button>
          </>
        }
      />

      {/* Hold banner */}
      {hold && (
        <div className="rounded-xl border-2 border-dn overflow-hidden mb-5"
          style={{ border: "2px solid var(--color-dn)" }}>
          <div className="bg-dn px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 text-white shrink-0" />
              <div>
                <p className="type-small font-semibold text-white">Client on hold</p>
                <p className="text-white/85 text-xs">Added {hold.addedAt ? format(new Date(hold.addedAt), "d MMM yyyy") : ""} by {hold.addedBy}</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setRemoveOpen(true)}
              className="!bg-white/15 !text-white !border-white/30">
              Remove hold
            </Button>
          </div>
          <div className="bg-dn-bg px-4 py-3 border-t border-dn-bd space-y-1">
            <div className="flex gap-2">
              <span className="text-xs font-semibold text-dn w-16 shrink-0">Reason</span>
              <span className="text-sm text-dn-tx font-medium">{hold.reason}</span>
            </div>
            {hold.notes && (
              <div className="flex gap-2">
                <span className="text-xs font-semibold text-dn w-16 shrink-0">Notes</span>
                <span className="text-sm text-dn-tx">{hold.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add to hold button (when not on hold) */}
      {!hold && (
        <div className="mb-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setHoldOpen(true)}
            className="text-t3 hover:text-dn hover:border-dn-bd">
            <ShieldOff className="h-3.5 w-3.5" /> Place on hold
          </Button>
        </div>
      )}

      {/* Sites under this client */}
      <div className={cn(surfaceCard, "mb-5 overflow-hidden")}>
        <div className="flex items-center justify-between border-b border-bd px-4 py-3">
          <h2 className="text-sm font-semibold text-t1">Managed Sites</h2>
          <Button type="button" size="sm" variant="outline" onClick={() => setCreateSiteOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add managed site
          </Button>
        </div>
        {sites.length === 0 ? (
          <p className="px-4 py-6 text-sm text-t3">No managed sites yet. Add one for long-term locations with multiple jobs.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map(site => (
              <SiteSummaryCard
                key={site.id}
                site={site}
                onOpen={() => {
                  setSelectedSiteId(site.id)
                  setSiteFilterId(site.id)
                }}
              />
            ))}
          </div>
        )}
        {siteFilterId && (
          <div className="flex items-center justify-between border-t border-bd px-4 py-2 text-xs text-t3">
            <span>Showing jobs for selected site</span>
            <button
              type="button"
              className="font-medium text-ac hover:text-ach"
              onClick={() => { setSiteFilterId(""); setSelectedSiteId(null) }}
            >
              Clear site filter
            </button>
          </div>
        )}
      </div>

      {/* Stats — admin only (job counts and financial aggregates) */}
      {isAdmin && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <StatCard label="Total jobs" value={stats.totalJobs}    />
          <StatCard label="Active" value={stats.activeJobs}   />
          <StatCard label="Issued" value={stats.issuedJobs}   />
          <StatCard label="Revisions" value={stats.totalRevisions} />
          <StatCard label="Total quoted" value={formatGBP(stats.totalQuotedValue)} />
          <StatCard label="Total invoiced" value={formatGBP(stats.totalInvoicedValue)} />
        </div>
      )}

      {/* Admin-only analytics */}
      {isAdmin && analytics && (
        <div className="mb-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-ac" />
            <h2 className="type-label text-t3">Client Analytics</h2>
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={surfaceCard + " p-3"}>
              <p className="type-label text-t3 mb-1">Completion Rate</p>
              <p className="type-stat text-t1">{analytics.completionRate}%</p>
              <p className="type-helper text-t4 mt-0.5">{analytics.completed} of {analytics.totalJobs} jobs</p>
            </div>
            <div className={surfaceCard + " p-3"}>
              <p className="type-label text-t3 mb-1">In Progress</p>
              <p className="type-stat text-yl">{analytics.inProgress}</p>
              <p className="type-helper text-t4 mt-0.5">{analytics.checking} awaiting check</p>
            </div>
            <div className={surfaceCard + " p-3"}>
              <p className="type-label text-t3 mb-1">Avg. Completion</p>
              <p className="type-stat text-t1">
                {analytics.avgCompletionDays != null ? `${analytics.avgCompletionDays}d` : "—"}
              </p>
              <p className="type-helper text-t4 mt-0.5">calendar days</p>
            </div>
            <div className={surfaceCard + " p-3"}>
              <p className="type-label text-t3 mb-1">Completed Value</p>
              <p className="type-stat text-ok-ic">{formatGBP(analytics.completedQuoted)}</p>
              <p className="type-helper text-t4 mt-0.5">of {formatGBP(analytics.totalQuoted)} quoted</p>
            </div>
          </div>

          {/* Status breakdown + item type breakdown side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Status breakdown */}
            <DetailPanel title="Jobs by Status" className="p-0">
              <div className="space-y-2">
                {([
                  { label: "New Request", count: analytics.newRequest, color: "var(--color-gy)" },
                  { label: "In Progress", count: analytics.inProgress, color: "var(--color-yl)" },
                  { label: "Requires Checking", count: analytics.checking, color: "var(--color-wn)" },
                  { label: "Ready to Send", count: analytics.readyToSend, color: "var(--color-rs-ic)" },
                  { label: "Complete", count: analytics.completed, color: "var(--color-ok-ic)" },
                ] as const).map(s => (
                  <div key={s.label} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-xs text-t2 flex-1">{s.label}</span>
                    <span className="text-xs font-semibold tabular-nums text-t1">{s.count}</span>
                    {analytics.totalJobs > 0 && (
                      <div className="w-20 h-1.5 rounded-full bg-pg overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(s.count / analytics.totalJobs) * 100}%`, backgroundColor: s.color }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </DetailPanel>

            {/* Item type breakdown */}
            <DetailPanel title="Jobs by Type">
              <div className="space-y-2">
                {([
                  { label: "Design", count: analytics.designs },
                  { label: "Revision", count: analytics.revisions },
                  { label: "Site Visit", count: analytics.siteVisits },
                  { label: "Survey", count: analytics.surveys },
                  { label: "Inspection", count: analytics.inspections },
                  { label: "CATIII Design Check", count: analytics.catiiiDesignChecks },
                ] as const).filter(t => t.count > 0).map(t => (
                  <div key={t.label} className="flex items-center gap-3">
                    <span className="text-xs text-t2 flex-1">{t.label}</span>
                    <span className="text-xs font-semibold tabular-nums text-t1">{t.count}</span>
                  </div>
                ))}
              </div>
            </DetailPanel>
          </div>

          {/* Monthly timeline */}
          {analytics.timeline.some(m => m.created > 0 || m.completed > 0) && (
            <DetailPanel title="12-Month Timeline">
              <div className="flex items-end gap-1" style={{ height: "80px" }}>
                {analytics.timeline.map((m, i) => {
                  const maxVal = Math.max(...analytics.timeline.map(t => Math.max(t.created, t.completed)), 1)
                  const createdH = (m.created / maxVal) * 64
                  const completedH = (m.completed / maxVal) * 64
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: ${m.created} created, ${m.completed} completed`}>
                      <div className="w-full flex items-end justify-center gap-px" style={{ height: "64px" }}>
                        <div className="w-[45%] rounded-t" style={{ height: `${Math.max(createdH, 1)}px`, backgroundColor: m.created > 0 ? "var(--color-ac)" : "var(--color-bd)" }} />
                        <div className="w-[45%] rounded-t" style={{ height: `${Math.max(completedH, 1)}px`, backgroundColor: m.completed > 0 ? "var(--color-ok-ic)" : "var(--color-bd)" }} />
                      </div>
                      <span className="type-helper text-t4 whitespace-nowrap">{m.month}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 type-helper text-t3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--color-ac)" }} /> Created
                </span>
                <span className="flex items-center gap-1.5 type-helper text-t3">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--color-ok-ic)" }} /> Completed
                </span>
              </div>
            </DetailPanel>
          )}
        </div>
      )}

      {/* Notes */}
      {client.notes && (
        <div className={cn(surfaceCard, "bg-pg px-4 py-3 mb-5 flex gap-2")}>
          <FileText className="h-4 w-4 text-t4 shrink-0 mt-0.5" />
          <p className="text-xs text-t2">{client.notes}</p>
        </div>
      )}

      {/* Jobs — split Managed Site vs One-Off when not filtering a single site */}
      {siteFilterId ? (
        <>
          {designJobs.length > 0 && (
            <section className="mb-5">
              <h2 className="type-label text-t3 mb-2">
                Designs ({designJobs.length})
                {revisionCount > 0 && (
                  <span className="ml-2 font-normal normal-case text-t4">· {revisionCount} revision{revisionCount === 1 ? "" : "s"} in history</span>
                )}
              </h2>
              <JobsTable jobs={designJobs} />
            </section>
          )}
          {nonDesignJobs.length > 0 && (
            <section className="mb-5">
              <h2 className="type-label text-t3 mb-2">Site visits & other ({nonDesignJobs.length})</h2>
              <JobsTable jobs={nonDesignJobs} />
            </section>
          )}
        </>
      ) : (
        <>
          {managedSiteJobs.length > 0 && (
            <section className="mb-5">
              <h2 className="type-label text-t3 mb-2">
                Jobs at Managed Sites ({managedSiteJobs.length})
              </h2>
              <JobsTable jobs={managedSiteJobs} />
            </section>
          )}
          <section className="mb-5">
            <h2 className="type-label text-t3 mb-2">
              One-Off Jobs ({oneOffJobs.length})
            </h2>
            {oneOffJobs.length === 0 ? (
              <p className="text-sm text-t3">No one-off jobs for this client.</p>
            ) : (
              <JobsTable jobs={[...oneOffDesign, ...oneOffOther]} />
            )}
          </section>
        </>
      )}

      {/* Add hold modal */}
      <Dialog open={holdOpen} onOpenChange={o => { if (!o && !holdSaving) { setHoldOpen(false); setHoldReason(""); setHoldNotes("") } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Place client on hold</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-t3 mb-3">{detail?.client.name}</p>
            <div className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label>Reason *</Label>
                <Input value={holdReason} onChange={e => setHoldReason(e.target.value)} autoFocus placeholder="e.g. Outstanding debt, dispute in progress" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Notes (optional)</Label>
                <Textarea value={holdNotes} onChange={e => setHoldNotes(e.target.value)} rows={2} placeholder="Additional context…" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setHoldOpen(false); setHoldReason(""); setHoldNotes("") }} disabled={holdSaving}>Cancel</Button>
            <Button variant="danger" onClick={addToHold} loading={holdSaving} disabled={!holdReason.trim()}>Place on hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove hold modal */}
      <Dialog open={removeOpen} onOpenChange={o => { if (!o && !holdSaving) { setRemoveOpen(false); setRemoveReason("") } }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Remove from hold</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-xs text-t3 mb-3">{detail?.client.name}</p>
            <div className="flex flex-col gap-1.5">
              <Label>Reason for removal (optional)</Label>
              <Input value={removeReason} onChange={e => setRemoveReason(e.target.value)} autoFocus placeholder="e.g. Debt settled, issue resolved" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemoveOpen(false); setRemoveReason("") }} disabled={holdSaving}>Cancel</Button>
            <Button variant="primary" onClick={removeFromHold} loading={holdSaving}>Remove from hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createSiteOpen && (
        <CreateSiteDialog
          clientId={client.id}
          clientName={client.name}
          onCreated={async () => {
            setCreateSiteOpen(false)
            await mutateSites()
            toast("Managed site created", "success")
          }}
          onUseExisting={async () => {
            setCreateSiteOpen(false)
            await mutateSites()
          }}
          onClose={() => setCreateSiteOpen(false)}
        />
      )}

      <Dialog open={!!selectedSiteId && !!siteDetail} onOpenChange={open => { if (!open) setSelectedSiteId(null) }}>
        <DialogContent size="md" className="p-0 overflow-hidden">
          {siteDetail && (
            <SiteDetailsPanel
              site={siteDetail.site}
              jobs={siteDetail.jobs}
              onClose={() => setSelectedSiteId(null)}
              onFilterRegister={sid => {
                setSelectedSiteId(null)
                router.push(`/jobs?clientId=${encodeURIComponent(client.id)}&siteId=${encodeURIComponent(sid)}`)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <p className="text-xs text-t4 mt-4">
        Client created {format(new Date(client.createdAt), "d MMMM yyyy")} ·
        Last updated {format(new Date(client.updatedAt), "d MMMM yyyy")}
      </p>
    </PageShell>
  )
}

function JobsTable({ jobs }: { jobs: Job[] }) {
  return (
    <DataPanel>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-pg border-b border-bd text-xs">
            <th className="px-3 py-2 text-left ">Drawing No.</th>
            <th className="px-3 py-2 text-left ">Address</th>
            <th className="px-3 py-2 text-left ">Completion Status</th>
            <th className="px-3 py-2 text-right ">Quote</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map(j => (
            <tr key={j.id} className="border-b border-bd last:border-0 hover:bg-pg">
              <td className="px-3 py-2.5 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  <RevisionFamilyBadge job={j} size="xs" />
                  <Link href={`/jobs/${j.id}`} className="type-drawing-number type-badge text-ac hover:underline">
                    {j.drawingNumber}
                  </Link>
                  {j.itemType && j.itemType !== "DESIGN" && j.itemType !== "REVISION" && (
                    <WorkItemTypeBadge itemType={j.itemType} size="sm" />
                  )}
                </span>
              </td>
              <td className="px-3 py-2.5 text-xs text-t2 max-w-[200px] truncate" title={j.address}>{j.address}</td>
              <td className="px-3 py-2.5"><StatusBadge status={j.status} /></td>
              <td className="px-3 py-2.5 text-right text-xs text-t2 tabular-nums">
                {j.quoteValue != null ? formatGBP(j.quoteValue) : <span className="text-t4">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataPanel>
  )
}
