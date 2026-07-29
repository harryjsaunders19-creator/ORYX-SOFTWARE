"use client"
import { useEffect, useMemo, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { FileText } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useToast } from "@/shared/ui/toast"
import { totalJobCommercialValue } from "@/shared/utils/utils"
import { useUser } from "@/shared/providers/user-context"
import { PageShell, PageBreadcrumb } from "@/shared/layouts/page-layout"
import { useApi } from "@/shared/hooks/use-api"
import type { Job, JobFormData, BillingHandoff } from "@/lib/types"
import { Skeleton } from "./job-page-primitives"
import { downloadCat2CheckSheet } from "./cat2-check-sheet-export"
import { JobDetailHeader } from "./job-detail-header"
import { JobDetailPrimaryActions } from "./job-detail-primary-actions"
import { JobDetailAttention, buildAttentionItems, type AttentionAction } from "./job-detail-attention"
import { JobDetailCurrentRevision } from "./job-detail-current-revision"
import { JobDetailTabs } from "./job-detail-tabs"
import type { DetailTab } from "./job-detail-tabs"
import { JobDetailSidebar } from "./job-detail-sidebar"
import { JobDetailDialogs } from "./job-detail-dialogs"
import { JobRevisionOverview } from "./job-revision-overview"
import type { RevisionFamilyResponse } from "../types/revision-types"
import { AddRevisionModal } from "./add-revision-modal"
import { AttachExistingQuoteModal } from "./attach-existing-quote-modal"
import { notifyRevisionsChanged } from "@/lib/revision-events"

export default function JobDetailPage({
  fallbackJob,
}: {
  fallbackJob?: (Job & { parentJob?: Job | null; billingHandoff?: BillingHandoff | null }) | null
} = {}) {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { toast } = useToast()
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
  const billingHandoff = job?.billingHandoff ?? null
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

  useEffect(() => {
    if (job?.parentJobId) {
      router.replace(`/jobs/${job.parentJobId}`)
    }
  }, [job?.parentJobId, router])

  useEffect(() => {
    if (!revisionFamily || selectedRevisionId) return
    const current = revisionFamily.chain.find(e => e.isCurrent)
    setSelectedRevisionId(current?.id ?? revisionFamily.original.id)
  }, [revisionFamily, selectedRevisionId])

  const notFound = !!jobError && /404|Not found/i.test(jobError.message)
  const loading = (isLoading && !job) || !!job?.parentJobId

  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [cancelReason, setCancelReason] = useState("")
  const [restoring, setRestoring] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>("overview")
  const [dnEditOpen, setDnEditOpen] = useState(false)
  const [dnEditValue, setDnEditValue] = useState("")
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
      load()
    } finally { setEditSaving(false) }
  }

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
      toast("Drawing number updated", "success")
    } catch { toast("Network error", "error") }
    finally { setDnEditSaving(false) }
  }

  const attentionItems = useMemo(
    () => (job ? buildAttentionItems(job, revisionFamily ?? null) : []),
    [job, revisionFamily],
  )

  const handleAttentionAction = (action: AttentionAction) => {
    switch (action) {
      case "assign":
        setAssignOpen(true)
        break
      case "create-quote":
        handleCreateQuote()
        break
      case "status":
        setActiveTab("overview")
        break
      case "billing":
        router.push("/billing")
        break
      case "deadline":
        setActiveTab("overview")
        break
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
  const commercialTotal = totalJobCommercialValue(job)
  const focus = job.currentRevision ?? job
  const canExportCat2 = focus.status === "ISSUED" || job.status === "ISSUED"
  const canAddRevision = !!revisionFamily?.canAddRevision
  const hasDesigner = !!(focus.designer?.trim() || job.designer?.trim())

  return (
    <PageShell wide>
      <PageBreadcrumb
        items={[
          { label: "Jobs", onClick: () => router.push("/jobs") },
          { label: job.drawingNumber, mono: true, strike: isCancelled },
        ]}
      />

      <div className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 xl:gap-8">
          <section className="min-w-0 w-full space-y-8">
            <JobDetailHeader
              job={job}
              isCancelled={isCancelled}
              isAdmin={isAdmin}
              restoring={restoring}
              onRestore={handleRestore}
              revisionFamily={revisionFamily ?? null}
              selectedRevisionId={selectedRevisionId}
              onSelectRevision={setSelectedRevisionId}
              onOpenRevisions={() => setActiveTab("revisions")}
            />

            <JobDetailPrimaryActions
              isCancelled={isCancelled}
              isAdmin={isAdmin}
              canAddRevision={canAddRevision}
              canExportCat2={canExportCat2}
              hasDesigner={hasDesigner}
              cat2Exporting={cat2Exporting}
              onAssign={() => setAssignOpen(true)}
              onCreateQuote={handleCreateQuote}
              onEdit={() => setEditOpen(true)}
              onAddRevision={() => setRevisionModalOpen(true)}
              onAttachQuote={() => setAttachQuoteOpen(true)}
              onCat2Export={() => void handleCat2Export()}
              onEditDrawingNumber={() => { setDnEditValue(job.drawingNumber); setDnEditOpen(true) }}
              onDelete={() => setDelOpen(true)}
            />

            <JobDetailAttention
              items={attentionItems}
              onAction={handleAttentionAction}
            />

            <JobDetailCurrentRevision
              job={job}
              revisionFamily={revisionFamily ?? null}
              isLoading={revisionsLoading}
              onOpenRevisions={() => setActiveTab("revisions")}
              onAddRevision={() => setRevisionModalOpen(true)}
            />

            {activeTab !== "revisions" && (
              <JobRevisionOverview
                job={job}
                revisionFamily={revisionFamily ?? null}
                isLoading={revisionsLoading}
                selectedRevisionId={selectedRevisionId}
                onSelectedRevisionId={id => {
                  setSelectedRevisionId(id)
                  setActiveTab("revisions")
                }}
                onAddRevision={() => setRevisionModalOpen(true)}
                preview
                onViewAll={() => setActiveTab("revisions")}
              />
            )}

            <JobDetailTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              job={job}
              workflowJobId={workflowJobId}
              isCancelled={isCancelled}
              billingHandoff={billingHandoff}
              commercialTotal={commercialTotal}
              revisionFamily={revisionFamily ?? null}
              revisionsLoading={revisionsLoading}
              selectedRevisionId={selectedRevisionId}
              onSelectedRevisionId={setSelectedRevisionId}
              onAddRevision={() => setRevisionModalOpen(true)}
              onStatusChange={s => {
                void mutateJob({ ...job, status: s }, { revalidate: false })
              }}
              onDesignerChange={v => void handleDesignerChange(v)}
            />
          </section>

          <JobDetailSidebar
            job={job}
            isCancelled={isCancelled}
            isAdmin={isAdmin}
            cat2Exporting={cat2Exporting}
            canExportCat2={canExportCat2}
            canAddRevision={canAddRevision}
            hasDesigner={hasDesigner}
            revisionFamily={revisionFamily ?? null}
            onAssign={() => setAssignOpen(true)}
            onEdit={() => setEditOpen(true)}
            onCreateQuote={handleCreateQuote}
            onAttachExistingQuote={() => setAttachQuoteOpen(true)}
            onAddRevision={() => setRevisionModalOpen(true)}
            onCat2Export={() => void handleCat2Export()}
            onDelete={() => setDelOpen(true)}
            onOpenDocumentsTab={() => setActiveTab("documents")}
            onEditDrawingNumber={() => { setDnEditValue(job.drawingNumber); setDnEditOpen(true) }}
          />
        </div>
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
