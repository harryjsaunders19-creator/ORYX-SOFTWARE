"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  GitBranch, Plus, Receipt, MapPin, UserCircle2, Download,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { StatusWorkflow } from "@/components/status-workflow"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { useApi } from "@/shared/hooks/use-api"
import { formatGBP, cn } from "@/shared/utils/utils"
import { worksTypeDisplayLabel } from "@/lib/constants"
import { PageShell, PageBreadcrumb } from "@/shared/layouts/page-layout"
import { DesignerCombobox } from "@/components/designer-combobox"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { DesignWorkItemRow } from "@/modules/jobs/types/design-work-item-types"

const JobDocumentsPanel = dynamic(
  () => import("@/modules/job-documents/components/job-documents-panel").then(m => m.JobDocumentsPanel),
  { ssr: false },
)

const EMPTY_WORK_ITEMS: DesignWorkItemRow[] = []

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-4 w-40 skeleton rounded" />
      <div className="h-9 w-72 skeleton rounded" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 skeleton rounded-xl" />
        ))}
      </div>
      <div className="h-64 skeleton rounded-xl" />
    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-2 border-b border-bd/70 pb-4 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-t3">{label}</span>
      <span className="text-base font-semibold text-t1 leading-snug">
        {value?.trim() ? value : <span className="font-normal text-t4 italic">Not set</span>}
      </span>
    </div>
  )
}

function KpiCard({
  label,
  value,
  badge,
}: {
  label: string
  value: string
  badge?: string | null
}) {
  return (
    <div className="rounded-xl border border-bd bg-sr p-4">
      <p className="type-label text-t3 mb-2">{label}</p>
      <div className="flex items-center gap-2 min-w-0">
        <p className="type-body-lg text-t1 truncate font-mono tabular-nums">{value}</p>
        {badge ? (
          <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-medium bg-wn-bg text-wn-tx">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "ok" | "ac" | "dn" | "neutral"
}) {
  const tones = {
    ok: "bg-ok-bg text-ok-tx",
    ac: "bg-ac-bg text-ac",
    dn: "bg-dn-bg text-dn-tx",
    neutral: "bg-pg text-t2 border border-bd",
  }
  const dots = {
    ok: "bg-ok-ic",
    ac: "bg-ac",
    dn: "bg-dn",
    neutral: "bg-t3",
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold",
      tones[tone],
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} />
      {children}
    </span>
  )
}

type DetailTab = "information" | "timeline" | "documents" | "financial" | "status"

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "information", label: "Job Information" },
  { id: "timeline", label: "Timeline" },
  { id: "documents", label: "Documents" },
  { id: "financial", label: "Financial" },
  { id: "status", label: "Status" },
]

function invoiceLabel(status: string): string {
  switch (status) {
    case "INVOICED": return "Invoiced"
    case "READY": return "Awaiting invoice"
    case "WRITTEN_OFF": return "Written off"
    default: return "—"
  }
}

function priorityTone(priority: string | null | undefined): "dn" | "neutral" | null {
  if (!priority) return null
  if (priority === "HIGH" || priority === "URGENT") return "dn"
  return "neutral"
}

function priorityLabel(priority: string | null | undefined): string | null {
  if (!priority) return null
  return priority.charAt(0) + priority.slice(1).toLowerCase() + " Priority"
}

export default function ParentJobDashboardPage({
  parentId,
  fallback,
}: {
  parentId: string
  fallback?: ParentJobDashboard | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { isAdmin } = useUser()

  const { data, error, isLoading, mutate } = useApi<ParentJobDashboard>(
    parentId ? `/api/parent-jobs/${parentId}` : null,
    { fallbackData: fallback ?? undefined },
  )

  const [revOpen, setRevOpen] = useState(false)
  const [revSaving, setRevSaving] = useState(false)
  const [description, setDescription] = useState("")
  const [descError, setDescError] = useState<string | null>(null)
  const [billable, setBillable] = useState(false)
  const [designer, setDesigner] = useState("")
  const [priority, setPriority] = useState("")
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<DetailTab>("information")
  const [cat2Exporting, setCat2Exporting] = useState(false)

  const parent = data?.parent
  const workItems = data?.workItems ?? EMPTY_WORK_ITEMS
  const current = data?.currentActive
  const canExportCat2 = useMemo(
    () => workItems.some(w => w.status === "ISSUED") || current?.status === "ISSUED",
    [workItems, current?.status],
  )

  const sortedItems = useMemo(
    () => [...workItems].sort((a, b) => b.dateCreated.localeCompare(a.dateCreated)),
    [workItems],
  )

  const handleCat2Export = async () => {
    setCat2Exporting(true)
    try {
      const res = await fetch(`/api/jobs/${parentId}/cat2-check-sheet`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "CAT II export failed", "error")
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="([^"]+)"/i)
      const filename = match?.[1] || "CATII Check Certificate.pdf"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast("CAT II Check Sheet exported", "success")
      void mutate()
    } catch {
      toast("CAT II export failed", "error")
    } finally {
      setCat2Exporting(false)
    }
  }

  const createRevision = async () => {
    const reason = description.trim()
    if (reason.length < 3) {
      setDescError("Please explain why this revision is needed (at least 3 characters).")
      return
    }
    setDescError(null)
    setRevSaving(true)
    try {
      const res = await fetch(`/api/parent-jobs/${parentId}/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: reason,
          notes: reason,
          billable,
          designer,
          priority: priority || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast(err.error ?? "Failed to create revision", "error")
        return
      }
      toast("Revision created", "success")
      setRevOpen(false)
      setDescription("")
      setBillable(false)
      setDesigner("")
      setPriority("")
      await mutate()
    } finally {
      setRevSaving(false)
    }
  }

  const patchWorkItem = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/work-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast(err.error ?? "Update failed", "error")
      return
    }
    await mutate()
  }

  const toggleBillable = async (item: DesignWorkItemRow, next: boolean) => {
    setTogglingId(item.id)
    try {
      await patchWorkItem(item.id, { billable: next })
    } finally {
      setTogglingId(null)
    }
  }

  if (isLoading && !data) {
    return <PageShell wide><Skeleton /></PageShell>
  }

  if (error || !parent) {
    return (
      <PageShell wide className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-t1 mb-1">Project not found</p>
        <p className="text-xs text-t3 mb-4">This parent job may not exist yet or has not been migrated.</p>
        <Button variant="outline" onClick={() => router.push("/jobs")}>Back to jobs</Button>
      </PageShell>
    )
  }

  const summary = data.invoiceSummary
  const siteLine = parent.siteAddress || parent.address || parent.siteName
  const currentRevLabel = current
    ? (current.revisionLetter ? `Rev ${current.revisionLetter}` : current.title)
    : "—"
  const outstanding = summary.readyTotal
  const pTone = priorityTone(current?.priority)

  return (
    <PageShell wide>
      <PageBreadcrumb
        items={[
          { label: "Jobs", onClick: () => router.push("/jobs") },
          { label: parent.drawingNumber, mono: true },
        ]}
      />

      {/* Header — Stitch Job Details */}
      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
        <div className="min-w-0 space-y-2">
          <h1 className="oryx-page-title text-t1 font-mono">
            {parent.drawingNumber}
          </h1>
          {siteLine && (
            <p className="text-sm text-t3 flex items-start gap-2">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{siteLine}</span>
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            <span className="type-label text-t3">Client</span>
            <span className="text-sm font-semibold text-t1">{parent.clientCompany}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:self-center">
          <div className="flex flex-wrap gap-2 lg:mr-1 lg:pr-4 lg:border-r lg:border-bd">
            {current && <StatusBadge status={current.status} />}
            {current?.revisionLetter && (
              <Pill tone="ac">Revision {current.revisionLetter}</Pill>
            )}
            {current?.workType === "ORIGINAL" && !current.revisionLetter && (
              <Pill tone="neutral">Original Issue</Pill>
            )}
            {pTone && current?.priority && (
              <Pill tone={pTone}>{priorityLabel(current.priority)}</Pill>
            )}
          </div>
          {data.canAddRevision && (
            <Button variant="primary" size="sm" onClick={() => setRevOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create Revision
              {data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </Button>
          )}
        </div>
      </header>

      {/* Actions — CAT II and related job actions */}
      {canExportCat2 && (
        <section className="rounded-xl border border-bd bg-sr p-6 mb-6">
          <h2 className="text-base font-semibold text-t1 mb-4">Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCat2Export()}
              loading={cat2Exporting}
            >
              <Download className="h-3.5 w-3.5" />
              Export CAT II Check Sheet
            </Button>
          </div>
        </section>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <KpiCard label="Current Revision" value={currentRevLabel} />
        <KpiCard
          label="Active Designer"
          value={current?.designer?.trim() || "Unassigned"}
        />
        <KpiCard
          label="Total Revisions"
          value={String(data.revisionCount)}
        />
        <KpiCard
          label="Total Billed"
          value={formatGBP(summary.billedTotal) ?? "—"}
        />
        <KpiCard
          label="Outstanding"
          value={formatGBP(outstanding) ?? "—"}
          badge={outstanding > 0 ? "Due" : null}
        />
      </div>

      {/* Main content — tabs */}
      <section className="overflow-hidden rounded-xl border border-bd bg-sr shadow-sm">
        <div
          role="tablist"
          aria-label="Job detail sections"
          className="flex flex-wrap gap-1 border-b border-bd bg-pg/40 px-2 pt-2 sm:px-3"
        >
          {DETAIL_TABS.map(tab => {
            const selected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-2 text-sm font-semibold rounded-t-lg border border-b-0 transition-colors",
                  selected
                    ? "bg-sr text-t1 border-bd -mb-px"
                    : "bg-transparent text-t3 border-transparent hover:text-t1 hover:bg-sr/60",
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-6 sm:p-6" role="tabpanel">
          {activeTab === "information" && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-t1">Job Information</h2>
                  <p className="text-sm text-t3 mt-0.5">Site, client, and assignment details</p>
                </div>
                <span className="text-sm text-t4 shrink-0">
                  Updated {format(new Date(parent.updatedAt), "d MMM yyyy HH:mm")}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                <InfoField label="Job Type" value="Design" />
                <InfoField label="Site Address" value={siteLine} />
                <InfoField
                  label="Type of works"
                  value={worksTypeDisplayLabel(parent.typeOfWorks, parent.customTypeDescription) || null}
                />
                <InfoField
                  label="Initial Quote"
                  value={
                    workItems.find(w => w.workType === "ORIGINAL")?.quoteValue != null
                      ? formatGBP(workItems.find(w => w.workType === "ORIGINAL")!.quoteValue)
                      : formatGBP(summary.quotedTotal)
                  }
                />
                <InfoField label="Requested by" value={parent.requestedBy} />
                <div>
                  <p className="type-label text-t3 mb-2">
                    Engineer Assigned
                  </p>
                  {current ? (
                    <DesignerCombobox
                      value={current.designer}
                      onChange={v => void patchWorkItem(current.id, { designer: v })}
                      placeholder="Select a user…"
                    />
                  ) : (
                    <p className="text-sm text-t4 italic">Unassigned</p>
                  )}
                </div>
                <InfoField label="Site name" value={parent.siteName} />
                <InfoField
                  label="Active work"
                  value={current ? current.title : "None — waiting for next revision"}
                />
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div>
              <div className="flex items-center justify-between gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-t1 inline-flex items-center gap-2">
                    <GitBranch className="h-5 w-5 text-ac" />
                    Revision Timeline
                  </h2>
                  <p className="text-sm text-t3 mt-0.5">Original issue and revisions for this job</p>
                </div>
                <span className="text-sm text-t3 tabular-nums shrink-0">
                  {workItems.length} work item{workItems.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="relative pl-8">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-bd" aria-hidden />
                <div className="space-y-6">
                  {sortedItems.map(item => {
                    const isCurrent = current?.id === item.id
                    const isComplete = item.status === "ISSUED"
                    const reason = item.description || item.notes

                    return (
                      <div key={item.id} className="relative">
                        <div
                          className={cn(
                            "absolute -left-8 top-1.5 h-4 w-4 rounded-full border-[3px] border-sr z-10",
                            isCurrent
                              ? "bg-ac shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-ac)_25%,transparent)]"
                              : isComplete
                                ? "bg-ok-ic"
                                : "bg-t4",
                          )}
                          aria-hidden
                        />
                        <div
                          className={cn(
                            "rounded-xl border p-4",
                            isCurrent
                              ? "border-ac/40 bg-ac-bg/30"
                              : "border-bd bg-sr",
                            !isCurrent && isComplete && "opacity-80",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <h3 className="type-body-lg text-t1">
                                {item.title}
                                {isCurrent ? " — In Progress" : isComplete ? " — Complete" : ""}
                              </h3>
                              <p className="text-sm text-t3 mt-0.5">
                                Created {format(new Date(item.dateCreated), "d MMM yyyy")}
                                {item.designer ? ` · ${item.designer}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 flex flex-wrap gap-2 justify-end">
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-ac text-on-ac">
                                  Active
                                </span>
                              )}
                              <StatusBadge status={item.status} />
                            </div>
                          </div>

                          {item.workType === "REVISION" && (
                            <blockquote className="text-base text-t2 leading-relaxed mb-3 border-l-2 border-bd pl-3">
                              {reason
                                ? `“${reason}”`
                                : <span className="italic text-t4">No reason recorded</span>}
                            </blockquote>
                          )}
                          {item.workType === "ORIGINAL" && reason && (
                            <p className="text-base text-t2 mb-3 whitespace-pre-wrap">{reason}</p>
                          )}

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-t3 mb-2">
                            <p className="inline-flex items-center gap-1">
                              <UserCircle2 className="h-3.5 w-3.5" />
                              {item.designer || "Unassigned"}
                            </p>
                            <p className="inline-flex items-center gap-1">
                              <Receipt className="h-3.5 w-3.5" />
                              {invoiceLabel(item.invoiceStatus)}
                              {item.invoiceNumber ? ` · ${item.invoiceNumber}` : ""}
                            </p>
                            {(item.quoteValue != null || item.billedValue != null) && (
                              <p className="tabular-nums">
                                {item.billedValue != null
                                  ? `Billed ${formatGBP(item.billedValue)}`
                                  : `Quoted ${formatGBP(item.quoteValue)}`}
                              </p>
                            )}
                            {item.completedAt && (
                              <p>Completed {format(new Date(item.completedAt), "d MMM yyyy")}</p>
                            )}
                          </div>

                          {isAdmin && item.workType === "REVISION" && (
                            <label className="mt-1 inline-flex items-center gap-2 text-sm text-t2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={item.billable}
                                disabled={togglingId === item.id}
                                onChange={e => void toggleBillable(item, e.target.checked)}
                              />
                              Chargeable (Ready for Invoicing when Complete)
                            </label>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {data.canAddRevision && (
                <div className="mt-6 pt-4 border-t border-bd">
                  <Button variant="outline" size="sm" onClick={() => setRevOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Add revision{data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === "documents" && (
            <div>
              <h2 className="text-lg font-semibold text-t1 mb-1">Documents</h2>
              <p className="text-sm text-t3 mb-6">PDFs and images — print emails to PDF to attach them</p>
              <JobDocumentsPanel jobId={parent.id} showTitle={false} />
            </div>
          )}

          {activeTab === "financial" && (
            <div>
              <h2 className="text-lg font-semibold text-t1 mb-1">Financial</h2>
              <p className="text-sm text-t3 mb-6">Quoted, billed, and ready-to-invoice totals</p>
              <div className="max-w-xl space-y-4 text-base">
                <div className="flex justify-between gap-2">
                  <span className="text-t3">Quoted total</span>
                  <span className="font-semibold tabular-nums text-t1">
                    {formatGBP(summary.quotedTotal) ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-t3">Billed</span>
                  <span className="font-semibold tabular-nums text-ok">
                    {formatGBP(summary.billedTotal) ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-t3">Ready to invoice</span>
                  <span className="font-semibold tabular-nums text-t1">
                    {formatGBP(summary.readyTotal) ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2 pt-3 border-t border-bd">
                  <span className="text-t3">Outstanding</span>
                  <span className="font-semibold tabular-nums text-t1">
                    {formatGBP(outstanding) ?? "—"}
                  </span>
                </div>
                <p className="text-sm text-t4 pt-1">
                  {summary.invoicedCount} of {summary.itemCount} work items invoiced
                </p>
              </div>
            </div>
          )}

          {activeTab === "status" && (
            <div>
              <h2 className="text-lg font-semibold text-t1 mb-1">Status</h2>
              <p className="text-sm text-t3 mb-6">
                {current
                  ? `Update workflow for ${current.title}`
                  : "No active work item — create a revision to continue"}
              </p>
              {current ? (
                <>
                  <div className="mb-4">
                    <StatusBadge status={current.status} />
                  </div>
                  <StatusWorkflow
                    jobId={current.id}
                    currentStatus={current.status}
                    onStatusChange={() => void mutate()}
                    patchUrl={`/api/work-items/${current.id}`}
                  />
                  <div className="mt-6">
                    <Label className="text-sm text-t3">Designer</Label>
                    <div className="mt-2">
                      <DesignerCombobox
                        value={current.designer}
                        onChange={v => void patchWorkItem(current.id, { designer: v })}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-base text-t4 italic">Nothing to update yet.</p>
              )}
            </div>
          )}
        </div>
      </section>

      <Dialog open={revOpen} onOpenChange={o => {
        if (!revSaving) {
          setRevOpen(o)
          if (!o) {
            setDescription("")
            setDescError(null)
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create Revision{data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </DialogTitle>
            <DialogDescription>
              Adds active work on {parent.drawingNumber}. The Parent Job stays the same — explain what the client asked for.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-lg border border-bd bg-pg px-3 py-2 text-xs text-t3 space-y-1">
              <p>
                New work item:{" "}
                <span className="font-semibold text-t1">Revision {data.nextRevisionLetter}</span>
              </p>
              <p>Starts as New Request. Mark Chargeable only if this revision should be invoiced separately.</p>
            </div>
            <div>
              <Label>
                Reason for revision<span className="text-dn ml-0.5">*</span>
              </Label>
              <p className="type-helper text-t4 mt-0.5 mb-2">
                What did the client request? This appears on the project timeline for the whole team.
              </p>
              <Textarea
                className={cn("mt-0", descError && "border-dn")}
                rows={4}
                value={description}
                onChange={e => {
                  setDescription(e.target.value)
                  if (descError) setDescError(null)
                }}
                placeholder="e.g. Client phoned — change bay spacing and add loading calcs on first floor"
                autoFocus
              />
              {descError && <p className="text-xs text-dn mt-1">{descError}</p>}
            </div>
            <div>
              <Label>Designer</Label>
              <div className="mt-2">
                <DesignerCombobox value={designer} onChange={setDesigner} />
              </div>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority || "__none"} onValueChange={v => setPriority(v === "__none" ? "" : v)}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-t2">
              <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
              Chargeable — bill this revision separately
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevOpen(false)} disabled={revSaving}>Cancel</Button>
            <Button
              variant="primary"
              loading={revSaving}
              disabled={!description.trim()}
              onClick={() => void createRevision()}
            >
              Create Revision{data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
