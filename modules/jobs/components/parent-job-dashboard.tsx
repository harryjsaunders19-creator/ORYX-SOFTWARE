"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { StatusWorkflow } from "@/components/status-workflow"
import { Label } from "@/shared/ui/label"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { useApi } from "@/shared/hooks/use-api"
import { formatGBP, cn } from "@/shared/utils/utils"
import { worksTypeDisplayLabel } from "@/lib/constants"
import { PageShell } from "@/shared/layouts/page-layout"
import { DesignerCombobox } from "@/components/designer-combobox"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { DesignWorkItemRow } from "@/modules/jobs/types/design-work-item-types"
import { Skeleton, InfoField } from "./job-page-primitives"
import { downloadCat2CheckSheet } from "./cat2-check-sheet-export"
import { priorityTone } from "./parent-job-helpers"
import { ParentJobHeader } from "./parent-job-header"
import { ParentRevisionTimeline } from "./parent-revision-timeline"
import { CreateRevisionDialog } from "./create-revision-dialog"

const JobDocumentsPanel = dynamic(
  () => import("@/modules/job-documents/components/job-documents-panel").then(m => m.JobDocumentsPanel),
  { ssr: false },
)

const EMPTY_WORK_ITEMS: DesignWorkItemRow[] = []

type DetailTab = "information" | "timeline" | "documents" | "financial" | "status"

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "information", label: "Job Information" },
  { id: "timeline", label: "Timeline" },
  { id: "documents", label: "Documents" },
  { id: "financial", label: "Financial" },
  { id: "status", label: "Status" },
]

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
    {
      fallbackData: fallback ?? undefined,
      ...(fallback ? { revalidateIfStale: false, revalidateOnMount: false } : {}),
    },
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
    () =>
      [...workItems].sort((a, b) => {
        const aTs = Date.parse(a.dateCreated || a.createdAt || "")
        const bTs = Date.parse(b.dateCreated || b.createdAt || "")
        const aSafe = Number.isFinite(aTs) ? aTs : 0
        const bSafe = Number.isFinite(bTs) ? bTs : 0
        return bSafe - aSafe
      }),
    [workItems],
  )

  const handleCat2Export = async () => {
    setCat2Exporting(true)
    try {
      const result = await downloadCat2CheckSheet(parentId)
      if (!result.ok) {
        toast(result.error, "error")
        return
      }
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
      <ParentJobHeader
        parent={parent}
        current={current ?? null}
        data={data}
        siteLine={siteLine}
        currentRevLabel={currentRevLabel}
        outstanding={outstanding}
        pTone={pTone}
        canExportCat2={canExportCat2}
        cat2Exporting={cat2Exporting}
        onRevOpen={() => setRevOpen(true)}
        onCat2Export={() => void handleCat2Export()}
        onNavigateJobs={() => router.push("/jobs")}
      />

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
            <ParentRevisionTimeline
              sortedItems={sortedItems}
              current={current ?? null}
              isAdmin={isAdmin}
              togglingId={togglingId}
              canAddRevision={data.canAddRevision}
              nextRevisionLetter={data.nextRevisionLetter}
              onRevOpen={() => setRevOpen(true)}
              onToggleBillable={(item, next) => void toggleBillable(item, next)}
            />
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

      <CreateRevisionDialog
        open={revOpen}
        saving={revSaving}
        nextRevisionLetter={data.nextRevisionLetter}
        drawingNumber={parent.drawingNumber}
        description={description}
        descError={descError}
        designer={designer}
        priority={priority}
        billable={billable}
        onDescriptionChange={v => {
          setDescription(v)
          if (descError) setDescError(null)
        }}
        onDesignerChange={setDesigner}
        onPriorityChange={setPriority}
        onBillableChange={setBillable}
        onClose={() => {
          setRevOpen(false)
          setDescription("")
          setDescError(null)
        }}
        onCreate={() => void createRevision()}
      />
    </PageShell>
  )
}
