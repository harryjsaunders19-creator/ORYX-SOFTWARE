"use client"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { FileText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { totalJobCommercialValue, getJobDeadlineInfo } from "@/shared/utils/utils"
import { useUser } from "@/shared/providers/user-context"
import { PageShell, PageBreadcrumb } from "@/shared/layouts/page-layout"
// Perf: SWR caches job detail across navigations; parent/billing keys follow when known.
import { useApi } from "@/shared/hooks/use-api"
import type { Job, JobFormData, BillingHandoff } from "@/lib/types"
import { Skeleton } from "./job-page-primitives"
import { downloadCat2CheckSheet } from "./cat2-check-sheet-export"
import { JobDetailHeader } from "./job-detail-header"
import { JobDetailTabs } from "./job-detail-tabs"
import type { DetailTab } from "./job-detail-tabs"
import { JobDetailSidebar } from "./job-detail-sidebar"
import { JobDetailDialogs } from "./job-detail-dialogs"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { JobRevisionOverview } from "./job-revision-overview"
import { AddRevisionModal } from "./add-revision-modal"
import { AttachExistingQuoteModal } from "./attach-existing-quote-modal"
import { notifyRevisionsChanged } from "@/lib/revision-events"

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
  // Parent detail page: status/PATCH operations target the parent itself.
  // Revisions are independent items with their own detail pages.
  const workflowJobId = job?.id ?? id

  const revisionsKey = id ? `/api/jobs/${id}/revisions` : null
  const {
    data: revisionFamily,
    isLoading: revisionsLoading,
    mutate: mutateRevisionFamily,
  } = useApi<RevisionFamilyResponse>(revisionsKey)

  const [revisionModalOpen, setRevisionModalOpen] = useState(false)
  const [attachQuoteOpen, setAttachQuoteOpen] = useState(false)
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)

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

  const handleRevisionSubmit = async (
    jobForRevision: Job,
    data: { notes: string; billable: boolean; quoteValue: number },
  ) => {
    const parentId = jobForRevision.parentJobId ?? jobForRevision.id
    const res = await fetch(`/api/jobs/${parentId}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      toast(body.error ?? "Failed to create revision", "error")
      return
    }
    const revision = await res.json() as Job
    toast(`${revision.drawingNumber} added successfully`, "success")
    notifyRevisionsChanged(parentId)
    setRevisionModalOpen(false)
    setSelectedRevisionId(null)
    void mutateRevisionFamily()
    void mutateJob()
  }

  const handleCreateQuote = () => {
    if (!job) return
    const p = new URLSearchParams({
      new: "1",
      jobId: job.id,
      clientCompany: job.clientCompany,
      ...(job.clientId ? { clientId: job.clientId } : {}),
      address: job.siteAddress || job.address || "",
      ...(job.typeOfWorks ? { typeOfWorks: job.typeOfWorks } : {}),
    })
    router.push(`/quotes?${p}`)
  }

  const handleAttachExistingQuote = () => {
    if (!job) return
    setAttachQuoteOpen(true)
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
      const result = await downloadCat2CheckSheet(id)
      if (!result.ok) {
        toast(result.error, "error")
        return
      }
      toast("CAT II Check Sheet exported", "success")
      setHistoryKey(k => k + 1)
    } catch {
      toast("CAT II export failed", "error")
    } finally {
      setCat2Exporting(false)
    }
  }

  const handleDnEditSave = async () => {
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

  return (
    <PageShell wide>
      <PageBreadcrumb
        items={[
          { label: "Jobs", onClick: () => router.push("/jobs") },
          { label: job.drawingNumber, mono: true, strike: isCancelled },
        ]}
      />

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <JobDetailHeader
            job={job}
            isCancelled={isCancelled}
            revLetter={revLetter}
            isAdmin={isAdmin}
            restoring={restoring}
            onRestore={handleRestore}
            onEdit={() => setEditOpen(true)}
            onAssign={() => setAssignOpen(true)}
            onDelete={() => setDelOpen(true)}
            onEditDrawingNumber={() => { setDnEditValue(job.drawingNumber); setDnEditOpen(true) }}
            revisionFamily={revisionFamily ?? null}
          />

          <JobRevisionOverview
            job={job}
            revisionFamily={revisionFamily ?? null}
            isLoading={revisionsLoading}
            selectedRevisionId={selectedRevisionId}
            onSelectedRevisionId={setSelectedRevisionId}
            onAddRevision={() => setRevisionModalOpen(true)}
          />

          <JobDetailTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            job={job}
            workflowJobId={workflowJobId}
            historyKey={historyKey}
            isCancelled={isCancelled}
            isRevision={isRevision}
            parentJob={parentJob}
            billingHandoff={billingHandoff}
            commercialTotal={commercialTotal}
            revisionFamily={revisionFamily ?? null}
            onFamilyChanged={() => {
              void mutateJob()
              void mutateRevisionFamily()
            }}
            onOpenEdit={() => setEditOpen(true)}
            onStatusChange={s => {
              void mutateJob({ ...job, status: s }, { revalidate: false })
              setHistoryKey(k => k + 1)
            }}
            onHistoryKeyIncrement={() => setHistoryKey(k => k + 1)}
            onDesignerChange={v => void handleDesignerChange(v)}
          />
        </div>

        <JobDetailSidebar
          job={job}
          dl={dl}
          isCancelled={isCancelled}
          isAdmin={isAdmin}
          cat2Exporting={cat2Exporting}
          revisionFamily={revisionFamily ?? null}
          onAssign={() => setAssignOpen(true)}
          onEdit={() => setEditOpen(true)}
          onCreateQuote={() => handleCreateQuote()}
          onAttachExistingQuote={() => handleAttachExistingQuote()}
          onCat2Export={() => void handleCat2Export()}
          onDelete={() => setDelOpen(true)}
          onOpenDocumentsTab={() => setActiveTab("documents")}
        />
      </div>

      <JobDetailDialogs
        job={job}
        workflowJobId={workflowJobId}
        isRevision={isRevision}
        assignOpen={assignOpen}
        onAssignClose={() => setAssignOpen(false)}
        onAssignSaved={updated => {
          void mutateJob({ ...job, designer: updated.designer }, { revalidate: true })
          setAssignOpen(false)
          setHistoryKey(k => k + 1)
        }}
        editOpen={editOpen}
        editSaving={editSaving}
        onEditClose={() => setEditOpen(false)}
        onEditSubmit={handleEdit}
        delOpen={delOpen}
        deleting={deleting}
        cancelReason={cancelReason}
        onCancelReasonChange={setCancelReason}
        onDeleteClose={() => { setDelOpen(false); setCancelReason("") }}
        onDelete={handleDelete}
        dnEditOpen={dnEditOpen}
        dnEditSaving={dnEditSaving}
        dnEditValue={dnEditValue}
        onDnEditValueChange={setDnEditValue}
        onDnEditClose={() => setDnEditOpen(false)}
        onDnEditSave={handleDnEditSave}
      />

      <AddRevisionModal
        job={revisionModalOpen ? job : null}
        onClose={() => setRevisionModalOpen(false)}
        onSubmit={handleRevisionSubmit}
      />

      <AttachExistingQuoteModal
        job={job}
        open={attachQuoteOpen}
        onClose={() => setAttachQuoteOpen(false)}
        onLinked={async () => {
          await mutateJob()
          await mutateRevisionFamily()
          setAttachQuoteOpen(false)
        }}
      />
    </PageShell>
  )
}
