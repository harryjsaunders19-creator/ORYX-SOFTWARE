"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { format } from "date-fns"
import dynamic from "next/dynamic"
import {
  Pencil, Trash2, FileText, UserPlus, Clock, AlertOctagon, RotateCcw, Download,
  MapPin,
} from "lucide-react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { StatusBadge }        from "@/components/status-badge"
import { WorkItemTypeBadge }  from "@/components/work-item-type-badge"
import { StatusWorkflow }     from "@/components/status-workflow"
import { DesignerCombobox }   from "@/components/designer-combobox"
import { useToast }            from "@/shared/ui/toast"
import { formatGBP, getJobDeadlineInfo, parseLocalDate, totalJobCommercialValue, cn } from "@/shared/utils/utils"
import { useUser }             from "@/shared/providers/user-context"
import { PageShell, PageBreadcrumb } from "@/shared/layouts/page-layout"
import { worksTypeDisplayLabel }    from "@/lib/constants"
// Perf: SWR caches job detail across navigations; parent/billing keys follow when known.
import { useApi } from "@/shared/hooks/use-api"
import type { Job, JobFormData, BillingHandoff } from "@/lib/types"

const AssignDesignerModal = dynamic(
  () => import("@/components/assign-designer-modal").then(m => m.AssignDesignerModal),
  { ssr: false },
)
const StatusHistory = dynamic(
  () => import("@/components/status-history").then(m => m.StatusHistory),
  { ssr: false },
)
const RevisionHistory = dynamic(
  () => import("@/components/revision-history").then(m => m.RevisionHistory),
  { ssr: false },
)
const JobDocumentsPanel = dynamic(
  () => import("@/modules/job-documents/components/job-documents-panel").then(m => m.JobDocumentsPanel),
  { ssr: false },
)
const JobForm = dynamic(
  () => import("./job-form").then(m => m.JobForm),
  { ssr: false },
)

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

function KpiCard({ label, value, badge }: { label: string; value: string; badge?: string | null }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-t3">{label}</p>
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-lg font-semibold text-t1 truncate font-mono tabular-nums">{value}</p>
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

type DetailTab = "information" | "timeline" | "documents" | "financial" | "status" | "activity"

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "information", label: "Job Information" },
  { id: "timeline", label: "Timeline" },
  { id: "documents", label: "Documents" },
  { id: "financial", label: "Financial" },
  { id: "status", label: "Status" },
  { id: "activity", label: "Activity" },
]

export default function JobDetailPage({
  fallbackJob,
}: {
  fallbackJob?: (Job & { parentJob?: Job | null; billingHandoff?: BillingHandoff | null }) | null
} = {}) {
  const params = useParams()
  const id     = params.id as string
  const router = useRouter()
  const { toast }    = useToast()
  const { isAdmin } = useUser()

  const detailKey = id
    ? `/api/jobs/${id}?include=${isAdmin ? "parent,billing,current" : "parent,current"}`
    : null

  const { data: job, error: jobError, isLoading, mutate: mutateJob } = useApi<
    Job & {
      parentJob?: Job | null
      billingHandoff?: BillingHandoff | null
      currentRevision?: Job | null
      currentRevisionId?: string | null
    }
  >(detailKey, {
    fallbackData: fallbackJob ?? undefined,
  })
  const parentJob = job?.parentJob ?? null
  const billingHandoff = job?.billingHandoff ?? null
  const workflowJobId = job?.currentRevisionId ?? job?.id ?? id

  // Revisions are not separate pages — one project card / one detail URL.
  useEffect(() => {
    if (job?.parentJobId) {
      router.replace(`/jobs/${job.parentJobId}`)
    }
  }, [job?.parentJobId, router])

  const notFound = !!jobError && /404|Not found/i.test(jobError.message)
  const loading = (isLoading && !job) || !!job?.parentJobId

  const [editOpen,   setEditOpen]   = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [delOpen,    setDelOpen]    = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [restoring,  setRestoring]  = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [activeTab, setActiveTab] = useState<DetailTab>("information")
  const [dnEditOpen,   setDnEditOpen]   = useState(false)
  const [dnEditValue,  setDnEditValue]  = useState("")
  const [dnEditSaving, setDnEditSaving] = useState(false)
  const [cat2Exporting, setCat2Exporting] = useState(false)

  useEffect(() => {
    if (jobError && !/404|Not found/i.test(jobError.message)) {
      toast("Failed to load job", "error")
    }
  }, [jobError, toast])

  const load = async () => {
    await mutateJob()
  }

  const handleEdit = async (form: JobFormData) => {
    setEditSaving(true)
    try {
      const res = await fetch(`/api/jobs/${workflowJobId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to save", "error")
        throw new Error()
      }
      toast("Saved", "success")
      setEditOpen(false)
      load(); setHistoryKey(k => k + 1)
    } finally { setEditSaving(false) }
  }

  /** Reassign designer from the overview dropdown (Users directory only). */
  const handleDesignerChange = async (designer: string) => {
    if (!job) return
    const previous = job.designer ?? ""
    if (designer === previous) return
    void mutateJob({ ...job, designer }, { revalidate: false })
    try {
      const res = await fetch(`/api/jobs/${workflowJobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designer }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to assign designer", "error")
        void mutateJob({ ...job, designer: previous }, { revalidate: false })
        return
      }
      toast(designer ? `Assigned to ${designer}` : "Designer unassigned", "success")
      setHistoryKey(k => k + 1)
      void mutateJob()
    } catch {
      toast("Network error", "error")
      void mutateJob({ ...job, designer: previous }, { revalidate: false })
    }
  }

  const handleDelete = async () => {
    const reason = cancelReason.trim()
    if (reason.length < 3) {
      toast("Please enter a cancellation reason (at least 3 characters)", "error")
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Cancel failed", "error")
        return
      }
      toast("Job moved to Archive", "info")
      setDelOpen(false)
      setCancelReason("")
      load()
    } finally { setDeleting(false) }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const res = await fetch(`/api/jobs/${id}/restore`, { method: "POST" })
      if (!res.ok) { toast("Restore failed", "error"); return }
      toast("Job restored", "success")
      load()
    } catch { toast("Network error", "error") }
    finally { setRestoring(false) }
  }

  const handleCat2Export = async () => {
    setCat2Exporting(true)
    try {
      const res = await fetch(`/api/jobs/${id}/cat2-check-sheet`, { method: "POST" })
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
      setHistoryKey(k => k + 1)
    } catch {
      toast("CAT II export failed", "error")
    } finally {
      setCat2Exporting(false)
    }
  }

  if (loading) return <PageShell wide><Skeleton /></PageShell>

  if (notFound || !job) return (
    <PageShell wide className="flex flex-col items-center justify-center py-24 text-center">
      <FileText className="h-5 w-5 text-t4 mb-3" />
      <p className="text-sm font-medium text-t1 mb-1">Job not found</p>
      <p className="text-xs text-t3 mb-4">This job may have been deleted.</p>
      <Button variant="outline" onClick={() => router.push("/jobs")}>Back to jobs</Button>
    </PageShell>
  )

  const isRevision = job.parentJobId !== null
  const isCancelled = !!job.archivedAt
  const revLetter = job.currentRevisionLetter ?? job.revisionLetter
  const commercialTotal = totalJobCommercialValue(job)
  const dl = getJobDeadlineInfo(job)

  const cancelSubtitle = job.cancelRecord
    ? [
        job.cancelRecord.performedByName,
        job.cancelRecord.reason ? `— ${job.cancelRecord.reason}` : "",
      ].filter(Boolean).join(" ")
    : null

  return (
    <PageShell wide>
      <PageBreadcrumb
        items={[
          { label: "Jobs", onClick: () => router.push("/jobs") },
          { label: job.drawingNumber, mono: true, strike: isCancelled },
        ]}
      />

      {isCancelled && (
        <div className="mb-6 rounded-xl border border-dn-bd bg-dn-bg px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-dn-tx flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-dn-bg border border-dn-bd">
                  Cancelled
                </span>
                <span className="font-mono line-through opacity-80">{job.drawingNumber}</span>
              </p>
              <p className="text-xs text-dn-tx/90 mt-1">
                Cancelled{" "}
                {job.archivedAt
                  ? format(new Date(job.archivedAt), "d MMM yyyy 'at' HH:mm")
                  : "—"}
                {cancelSubtitle ? ` by ${cancelSubtitle}` : ""}
              </p>
              <p className="text-xs text-t3 mt-1">
                This drawing number stays on record and will not be reused.
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" loading={restoring} onClick={handleRestore}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore job
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Master job card — Stitch layout */}
      <section className="oryx-surface-card mb-8 overflow-hidden rounded-xl border border-bd bg-sr p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={job.status} />
              <span className="font-mono text-base text-t3 tabular-nums">{job.drawingNumber}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className={cn(
                "oryx-page-title text-t1",
                isCancelled && "line-through opacity-70",
              )}>
                {job.clientCompany}
              </h1>
              {isAdmin && !isCancelled && (
                <button
                  onClick={() => { setDnEditValue(job.drawingNumber); setDnEditOpen(true) }}
                  className="text-t4 hover:text-ac"
                  title="Edit drawing number"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {job.address && (
              <p className="text-base text-t2 flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-1 shrink-0" />
                <span>{job.address}</span>
              </p>
            )}
            <p className="text-sm text-t3 pt-1">
              Workflow actions apply to{" "}
              <span className="font-semibold text-t1">
                Current Revision: {revLetter ? `Rev ${revLetter}` : "Original"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:self-start">
            <div className="flex flex-wrap gap-2">
              <WorkItemTypeBadge itemType={job.itemType ?? "DESIGN"} />
              {revLetter && <Pill tone="ac">Revision {revLetter}</Pill>}
              {!revLetter && (job.itemType === "DESIGN" || !job.itemType) && (
                <Pill tone="neutral">Original Issue</Pill>
              )}
              {dl.severity !== "none" && (
                <Pill tone={dl.severity === "overdue" ? "dn" : "neutral"}>
                  {dl.label}
                </Pill>
              )}
            </div>
            {!isCancelled ? (
              <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                <Button variant={job.designer ? "outline" : "primary"} size="sm" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  {job.designer ? "Change designer" : "Assign designer"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                {isAdmin && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setDelOpen(true)} title="Cancel job">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ) : isAdmin ? (
              <Button variant="outline" size="sm" loading={restoring} onClick={handleRestore}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            ) : null}
          </div>
        </div>

        {(job.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 pb-6 border-b border-bd">
            {(job.tags ?? []).map(tag => (
              <Pill key={tag} tone="neutral">{tag}</Pill>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2 border-t border-bd">
          <KpiCard label="Current Revision" value={revLetter ? `Rev ${revLetter}` : "Original"} />
          <KpiCard label="Active Designer" value={job.designer?.trim() || "Unassigned"} />
          <KpiCard label="Total Revisions" value={job.revisionCount != null ? String(job.revisionCount) : "—"} />
          <KpiCard label="Quote / Agreed" value={formatGBP(commercialTotal) ?? "—"} />
          <KpiCard
            label="Deadline"
            value={job.requiredByDate ? format(parseLocalDate(job.requiredByDate), "d MMM yyyy") : "—"}
            badge={dl.severity === "overdue" ? "Due" : dl.severity === "today" ? "Today" : null}
          />
        </div>
      </section>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        <div className="lg:col-span-7">
          <section className="oryx-surface-card overflow-hidden rounded-xl border border-bd bg-sr shadow-sm">
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
                      Updated {format(new Date(job.updatedAt), "d MMM yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                    <InfoField
                      label="Job Type"
                      value={(() => {
                        const t = job.itemType ?? "DESIGN"
                        return t.charAt(0) + t.slice(1).toLowerCase().replace("_", " ")
                      })()}
                    />
                    <InfoField label="Site Address" value={job.address} />
                    <InfoField
                      label="Type of works"
                      value={worksTypeDisplayLabel(job.typeOfWorks, job.customTypeDescription) || null}
                    />
                    <InfoField
                      label="Initial Quote"
                      value={formatGBP(job.quoteValue) ?? (parentJob?.quoteValue != null ? formatGBP(parentJob.quoteValue) : null)}
                    />
                    <InfoField label="Requested by" value={job.requestedBy} />
                    <div>
                      <p className="text-xs font-medium text-t3 mb-2">
                        Engineer Assigned
                      </p>
                      {isCancelled ? (
                        <p className="text-sm text-t1">{job.designer || "Unassigned"}</p>
                      ) : (
                        <DesignerCombobox
                          value={job.designer}
                          onChange={v => void handleDesignerChange(v)}
                          placeholder="Select a user…"
                        />
                      )}
                    </div>
                    <InfoField label="Client" value={job.clientCompany} />
                    <InfoField label="Created" value={format(new Date(job.dateCreated), "d MMMM yyyy")} />
                    {job.legacyTypeOfWorks && (
                      <InfoField label="Originally entered as" value={job.legacyTypeOfWorks} />
                    )}
                    {job.dateCompleted && (
                      <InfoField label="Completed" value={format(parseLocalDate(job.dateCompleted), "d MMMM yyyy")} />
                    )}
                    {job.requiredByDate && (
                      <InfoField label="Required by" value={format(parseLocalDate(job.requiredByDate), "d MMMM yyyy")} />
                    )}
                    {job.notes && <InfoField label="Notes" value={job.notes} />}
                    {job.designStandards && (
                      <InfoField label="Design standards & codes" value={job.designStandards} />
                    )}
                    {(job.tags ?? []).length > 0 && (
                      <InfoField label="Tags" value={(job.tags ?? []).join(", ")} />
                    )}
                  </div>
                </div>
              )}

              {activeTab === "timeline" && (
                <RevisionHistory
                  job={job}
                  refreshKey={historyKey}
                  embedded
                  onFamilyChanged={() => { void mutateJob(); setHistoryKey(k => k + 1) }}
                />
              )}

              {activeTab === "documents" && (
                <div>
                  <h2 className="text-lg font-semibold text-t1 mb-1">Documents</h2>
                  <p className="text-sm text-t3 mb-6">PDFs and images — print emails to PDF to attach them</p>
                  <JobDocumentsPanel
                    jobId={job.id}
                    showTitle={false}
                    onTimelineChange={() => setHistoryKey(k => k + 1)}
                  />
                </div>
              )}

              {activeTab === "financial" && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-6">
                    <div>
                      <h2 className="text-lg font-semibold text-t1">Financial</h2>
                      <p className="text-sm text-t3 mt-0.5">Quote, variations, and invoicing</p>
                    </div>
                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => setEditOpen(true)}
                        className="text-sm text-ac hover:text-ach font-medium shrink-0"
                      >
                        {job.quoteValue != null || job.quoteReference || job.quoteDate || job.commercialNotes
                          || job.variationFees != null || job.additionalCharges != null
                          ? "Edit quote"
                          : "Add quote"}
                      </button>
                    )}
                  </div>
                  {job.quoteValue != null || job.quoteReference || job.quoteDate || job.commercialNotes
                    || job.variationFees != null || job.additionalCharges != null ? (
                    <div className="max-w-xl space-y-4 text-base">
                      {job.quoteValue != null && (
                        <div className="flex justify-between gap-2">
                          <span className="text-t3">Quote value</span>
                          <span className="font-semibold tabular-nums text-t1">{formatGBP(job.quoteValue)}</span>
                        </div>
                      )}
                      {job.variationFees != null && (
                        <div className="flex justify-between gap-2">
                          <span className="text-t3">Variation fees</span>
                          <span className="font-semibold tabular-nums text-t1">{formatGBP(job.variationFees)}</span>
                        </div>
                      )}
                      {job.additionalCharges != null && (
                        <div className="flex justify-between gap-2">
                          <span className="text-t3">Additional charges</span>
                          <span className="font-semibold tabular-nums text-t1">{formatGBP(job.additionalCharges)}</span>
                        </div>
                      )}
                      {commercialTotal != null && (
                        <div className="flex justify-between gap-2 pt-3 border-t border-bd">
                          <span className="text-t3 font-medium">Total agreed</span>
                          <span className="font-bold tabular-nums text-t1">{formatGBP(commercialTotal)}</span>
                        </div>
                      )}
                      {job.quoteReference && (
                        <p className="text-sm text-t4 pt-1">Ref {job.quoteReference}</p>
                      )}
                      {job.quoteDate && (
                        <p className="text-sm text-t4">
                          Quote date {format(parseLocalDate(job.quoteDate), "d MMM yyyy")}
                        </p>
                      )}
                      {job.commercialNotes && (
                        <p className="text-sm text-t3 pt-1 whitespace-pre-wrap">{job.commercialNotes}</p>
                      )}
                      {isRevision && parentJob && job.quoteValue == null && parentJob.quoteValue != null && (
                        <p className="text-sm text-t3 pt-2 border-t border-bd">
                          Inherited from parent:{" "}
                          <span className="font-semibold text-t1">{formatGBP(parentJob.quoteValue)}</span>
                        </p>
                      )}
                      {billingHandoff && (
                        <div className="pt-2 mt-1 border-t border-bd">
                          <p className="text-sm text-t3">
                            Invoicing:{" "}
                            {billingHandoff.clearedByAccountsAt ? (
                              <span className="font-medium text-ok-tx">
                                Cleared{billingHandoff.clearedBy ? ` (${billingHandoff.clearedBy})` : ""}
                              </span>
                            ) : (
                              <span className="font-medium text-wn-tx">Awaiting accounts</span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-base text-t4 italic">No quote added yet.</p>
                  )}
                </div>
              )}

              {activeTab === "status" && (
                <div>
                  <h2 className="text-lg font-semibold text-t1 mb-1">Status</h2>
                  <p className="text-sm text-t3 mb-6">Update the workflow for the current revision</p>
                  {isCancelled ? (
                    <StatusBadge status={job.status} />
                  ) : (
                    <StatusWorkflow
                      jobId={workflowJobId}
                      currentStatus={job.status}
                      onStatusChange={s => {
                        void mutateJob({ ...job, status: s }, { revalidate: false })
                        setHistoryKey(k => k + 1)
                      }}
                    />
                  )}
                </div>
              )}

              {activeTab === "activity" && (
                <div>
                  <h2 className="text-lg font-semibold text-t1 mb-1">Activity</h2>
                  <p className="text-sm text-t3 mb-6">Status changes, notes, and document events</p>
                  <StatusHistory
                    key={historyKey}
                    jobId={workflowJobId}
                    onUpdate={() => setHistoryKey(k => k + 1)}
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {job.requiredByDate && job.status !== "ISSUED" && (
            <div className={cn(
              "rounded-xl border p-4",
              dl.severity === "overdue" ? "bg-dn-bg border-dn-bd"
                : dl.severity === "today" ? "bg-wn-bg border-wn-bd"
                : dl.severity === "soon" ? "bg-wn-bg/60 border-wn-bd/60"
                : "bg-sr border-bd",
            )}>
              <div className="flex items-center gap-2 mb-2">
                {dl.severity === "overdue"
                  ? <AlertOctagon className="h-4 w-4 text-dn shrink-0" />
                  : <Clock className="h-4 w-4 text-t4 shrink-0" />}
                <p className="text-xs font-semibold text-t3">Deadline</p>
              </div>
              <p className={cn(
                "text-sm font-semibold tabular-nums",
                dl.severity === "overdue" || dl.severity === "today" || dl.severity === "soon"
                  ? (dl.severity === "overdue" ? "text-dn-tx" : "text-wn-tx")
                  : "text-t1",
              )}>
                {dl.label}
              </p>
              <p className="text-xs text-t3 mt-0.5">
                {format(parseLocalDate(job.requiredByDate), "d MMM yyyy")}
              </p>
            </div>
          )}

          <section className="rounded-xl border border-bd bg-sr p-6">
            <h2 className="text-base font-semibold text-t1 mb-4">Actions</h2>
            {isCancelled ? (
              <p className="text-xs text-t3">
                This job is cancelled. Restore it to make changes or return it to active views.
              </p>
            ) : (
              <div className="space-y-2">
                <Button
                  variant={job.designer ? "outline" : "primary"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setAssignOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {job.designer ? "Change designer" : "Assign designer"}
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit details
                </Button>
                {(job.status === "ISSUED" || job.currentRevision?.status === "ISSUED") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => void handleCat2Export()}
                    loading={cat2Exporting}
                  >
                    <Download className="h-3.5 w-3.5" /> Export CAT II Check Sheet
                  </Button>
                )}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-dn hover:bg-dn-bg"
                    onClick={() => setDelOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Cancel job
                  </Button>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-bd bg-sr p-6">
            <h2 className="text-base font-semibold text-t1 mb-3">Dates</h2>
            <dl className="space-y-2">
              {([
                ["Created", format(new Date(job.dateCreated), "d MMM yyyy")],
                ...(job.dateCompleted
                  ? [["Completed", format(parseLocalDate(job.dateCompleted), "d MMM yyyy")] as [string, string]]
                  : []),
                ["Updated", format(new Date(job.updatedAt), "d MMM yyyy")],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-xs">
                  <dt className="text-t3">{l}</dt>
                  <dd className="font-medium text-t1 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {/* Assign designer */}
      <AssignDesignerModal
        job={assignOpen ? { ...job, id: workflowJobId } : null}
        onClose={() => setAssignOpen(false)}
        onSaved={updated => {
          void mutateJob({ ...job, designer: updated.designer }, { revalidate: true })
          setAssignOpen(false)
          setHistoryKey(k => k + 1)
        }}
      />

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={o => { if (!o && !editSaving) setEditOpen(false) }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
            <DialogDescription>
              Update the current revision&apos;s details and status.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <JobForm
              key={editOpen ? `edit-${job.id}` : "closed"}
              formId="detail-edit-form"
              job={job} onSubmit={handleEdit}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button type="submit" form="detail-edit-form" variant="primary" loading={editSaving} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={delOpen} onOpenChange={o => {
        if (!o && !deleting) { setDelOpen(false); setCancelReason("") }
      }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel {isRevision ? "revision" : "job"}</DialogTitle>
            <DialogDescription>
              Cancel{" "}
              <span className="font-mono font-semibold text-ac">{job.drawingNumber}</span>?
              The {isRevision ? "revision" : "job"} moves to <strong>Archived Items</strong>. Its drawing number is kept on record and will not be reused.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="block text-xs font-medium text-t2 mb-2">
              Reason for cancellation <span className="text-dn">*</span>
            </label>
            <Textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="e.g. Client withdrew, duplicate entry…"
              rows={3}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDelOpen(false); setCancelReason("") }} disabled={deleting}>
              Keep job
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleting}
              disabled={deleting || cancelReason.trim().length < 3}
            >
              {deleting ? "Cancelling…" : "Cancel job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing number edit dialog — admin only */}
      <Dialog open={dnEditOpen} onOpenChange={o => { if (!o && !dnEditSaving) setDnEditOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit drawing number</DialogTitle>
            <DialogDescription>
              Current: <span className="font-mono font-semibold">{job.drawingNumber}</span>. The sequence counter will be updated automatically to prevent future duplicates.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              value={dnEditValue}
              onChange={e => setDnEditValue(e.target.value)}
              placeholder="e.g. 26/ORYX/06/001"
              className="font-mono"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnEditOpen(false)} disabled={dnEditSaving}>Cancel</Button>
            <Button
              variant="primary"
              loading={dnEditSaving}
              disabled={dnEditSaving || !dnEditValue.trim() || dnEditValue.trim() === job.drawingNumber}
              onClick={async () => {
                setDnEditSaving(true)
                try {
                  const res = await fetch(`/api/jobs/${id}/drawing-number`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ drawingNumber: dnEditValue.trim() }),
                  })
                  const data = await res.json() as Job & { error?: string }
                  if (!res.ok) { toast(data.error ?? "Failed to update", "error"); return }
                  void mutateJob(data, { revalidate: false })
                  setDnEditOpen(false)
                  setHistoryKey(k => k + 1)
                  toast("Drawing number updated", "success")
                } catch { toast("Network error", "error") }
                finally { setDnEditSaving(false) }
              }}
            >
              {dnEditSaving ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
