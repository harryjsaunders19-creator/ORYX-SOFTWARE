"use client"

import { useMemo, useState, lazy, Suspense } from "react"
import {
  X, Plus, Upload, Send, FileText, Receipt, MoreHorizontal, ArrowRight,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { StatusBadge } from "@/modules/jobs/components/badges/status-badge"
import { useApi } from "@/shared/hooks/use-api"
import { cn } from "@/shared/utils/utils"
import { Typography } from "@/shared/design/typography"
import type { Job } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { JobsRegisterProject } from "./jobs-register-types"
import { INSPECTOR_W } from "./jobs-register-types"
import {
  deriveNextAction,
  deriveWorkflowProgress,
  revisionBadgeLabel,
  siteDisplay,
  shortStatusLabel,
} from "./jobs-register-helpers"
import {
  JobsInspectorCurrentFocus,
  JobsInspectorMetrics,
} from "./jobs-inspector-focus-metrics"
import {
  JobsInspectorRevisionTimeline,
  type InspectorRevision,
} from "./jobs-inspector-revision-timeline"
import {
  JobsInspectorWorkflow,
  JobsInspectorRecentFiles,
  JobsInspectorActivityFeed,
  type InspectorFileItem,
  type InspectorActivityItem,
} from "./jobs-inspector-sections"

const AddRevisionModal = lazy(() =>
  import("./add-revision-modal").then(m => ({ default: m.AddRevisionModal })),
)

interface JobsInspectorProps {
  project: JobsRegisterProject
  workItemsModel: boolean
  onClose: () => void
  onOpenWorkspace: () => void
  onAddRevisionRequest?: () => void
}

interface HistoryResponse {
  history: {
    id: string
    changedAt: string
    changedBy: string
    note: string | null
    toStatus: string
    fromStatus: string | null
  }[]
}

interface DocumentsResponse {
  documents: {
    id: string
    filename: string
    originalFilename?: string | null
    category: string | null
    mimeType?: string | null
    fileExt?: string | null
    createdAt: string
  }[]
}

interface RevisionsResponse {
  chain?: {
    id: string
    revisionLetter: string | null
    status: string
    dateCreated: string
    designer: string
    notes: string | null
    quoteValue?: number | null
    billable?: boolean
    dateCompleted?: string | null
    issuedAt?: string | null
    isCurrent?: boolean
    title?: string
  }[]
  canAddRevision?: boolean
}

export function JobsInspector({
  project,
  workItemsModel,
  onClose,
  onOpenWorkspace,
}: JobsInspectorProps) {
  const [addRevOpen, setAddRevOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const parentKey = workItemsModel
    ? `/api/parent-jobs/${project.id}`
    : null
  const jobKey = !workItemsModel
    ? `/api/jobs/${project.id}?include=parent,current`
    : null
  const revisionsKey = !workItemsModel
    ? `/api/jobs/${project.id}/revisions`
    : null

  const docJobId = workItemsModel ? project.id : project.detailId
  const historyKey = `/api/jobs/${docJobId}/history`
  const docsKey = `/api/jobs/${docJobId}/documents?limit=12`

  const { data: parentDash, isLoading: parentLoading } = useApi<ParentJobDashboard>(parentKey)
  const { data: jobDetail, isLoading: jobLoading } = useApi<{ job: Job }>(jobKey)
  const { data: revisionsData } = useApi<RevisionsResponse>(revisionsKey)
  const { data: historyData } = useApi<HistoryResponse>(historyKey)
  const { data: docsData } = useApi<DocumentsResponse>(docsKey)

  const loading = workItemsModel ? parentLoading : jobLoading

  const revisions: InspectorRevision[] = useMemo(() => {
    if (workItemsModel && parentDash) {
      const currentId = parentDash.currentActive?.id
      return [...parentDash.workItems]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(wi => ({
          id: wi.id,
          letter: wi.revisionLetter,
          title: wi.title,
          status: wi.status,
          createdAt: wi.dateCreated || wi.createdAt,
          designer: wi.designer,
          reason: wi.description,
          notes: wi.notes,
          billable: wi.billable,
          value: wi.quoteValue,
          drawingStatus: shortStatusLabel(wi.status),
          invoiceStatus: wi.invoiceStatus,
          completionStatus: wi.completedAt ? "Complete" : shortStatusLabel(wi.status),
          isCurrent: wi.id === currentId,
        }))
    }

    const chain = revisionsData?.chain ?? []
    return chain.map((r, idx) => ({
      id: r.id,
      letter: r.revisionLetter,
      title: r.title || (r.revisionLetter ? `Revision ${r.revisionLetter}` : "Original Design"),
      status: r.status,
      createdAt: r.dateCreated,
      designer: r.designer,
      reason: r.notes,
      notes: r.notes,
      billable: r.billable ?? true,
      value: r.quoteValue ?? null,
      drawingStatus: shortStatusLabel(r.status),
      invoiceStatus: "—",
      completionStatus: (r.dateCompleted || r.issuedAt) ? "Complete" : shortStatusLabel(r.status),
      isCurrent: r.isCurrent ?? idx === 0,
    }))
  }, [workItemsModel, parentDash, revisionsData])

  const currentRev = revisions.find(r => r.isCurrent) ?? revisions[0]

  const metrics = useMemo(() => {
    if (workItemsModel && parentDash) {
      const items = parentDash.workItems
      const original = items.find(i => i.workType === "ORIGINAL")
      const revItems = items.filter(i => i.workType === "REVISION")
      const revisionRevenue = revItems.reduce((s, i) => s + (i.quoteValue ?? 0), 0)
      const originalFee = original?.quoteValue ?? null
      const total = parentDash.invoiceSummary.quotedTotal
      const outstanding =
        parentDash.invoiceSummary.quotedTotal - parentDash.invoiceSummary.billedTotal
      return {
        originalFee,
        revisionRevenue,
        totalValue: total || null,
        outstanding: outstanding > 0 ? outstanding : 0,
        revisionCount: parentDash.revisionCount,
        lastActivity: items.map(i => i.updatedAt).sort().at(-1) ?? null,
      }
    }

    const job = jobDetail?.job
    const chain = revisionsData?.chain ?? []
    const original = chain.find(r => !r.revisionLetter) ?? chain.at(-1)
    const revSum = chain
      .filter(r => r.revisionLetter)
      .reduce((s, r) => s + (r.quoteValue ?? 0), 0)
    return {
      originalFee: original?.quoteValue ?? job?.quoteValue ?? null,
      revisionRevenue: revSum,
      totalValue:
        chain.reduce((s, r) => s + (r.quoteValue ?? 0), 0) || job?.quoteValue || null,
      outstanding: null,
      revisionCount: job?.revisionCount ?? Math.max(0, chain.length - 1),
      lastActivity: job?.updatedAt ?? null,
    }
  }, [workItemsModel, parentDash, jobDetail, revisionsData])

  const files: InspectorFileItem[] = useMemo(() => {
    const docs = docsData?.documents ?? []
    const url = (id: string, action: "preview" | "download") =>
      `/api/jobs/${docJobId}/documents/${id}/${action}`
    const pick = (
      pred: (d: (typeof docs)[0]) => boolean,
      label: string,
      kind: InspectorFileItem["kind"],
    ) => {
      const hit = docs.find(pred)
      if (!hit) return null
      return {
        id: hit.id,
        label: label || hit.originalFilename || hit.filename,
        kind,
        uploadedAt: hit.createdAt,
        openUrl: url(hit.id, "preview"),
        downloadUrl: url(hit.id, "download"),
      } satisfies InspectorFileItem
    }

    return [
      pick(
        d => /draw|dwg/i.test(d.filename) || /drawing/i.test(d.category ?? ""),
        "Latest Drawing",
        "drawing",
      ),
      pick(
        d => /calc/i.test(d.filename) || /calc/i.test(d.category ?? ""),
        "Latest Calculation",
        "calculation",
      ),
      pick(
        d => /\.pdf$/i.test(d.filename) || /pdf|revision/i.test(d.category ?? ""),
        "Latest Revision PDF",
        "pdf",
      ),
    ].filter(Boolean) as InspectorFileItem[]
  }, [docsData, docJobId])

  const activity: InspectorActivityItem[] = useMemo(() => {
    return (historyData?.history ?? []).slice(0, 12).map(h => ({
      id: h.id,
      timestamp: h.changedAt,
      user: h.changedBy || "System",
      action:
        h.note?.trim() ||
        (h.toStatus
          ? `Status → ${shortStatusLabel(h.toStatus)}`
          : "Activity"),
    }))
  }, [historyData])

  const workflow = deriveWorkflowProgress({
    status: currentRev?.status ?? project.currentStatus,
    hasDrawing: files.some(f => f.kind === "drawing"),
    invoiceStatus: currentRev?.invoiceStatus,
  })

  const parent = parentDash?.parent
  const client = parent?.clientCompany ?? jobDetail?.job.clientCompany ?? project.clientCompany
  const site = siteDisplay(
    parent?.siteName ?? jobDetail?.job.siteName ?? project.siteName,
    parent?.address ?? jobDetail?.job.address ?? project.address,
  )
  const drawingNumber =
    parent?.drawingNumber ?? jobDetail?.job.drawingNumber ?? project.drawingNumber
  const projectStatus = project.projectStatus
  const revStatus = currentRev?.status ?? project.currentStatus
  const revLabel = revisionBadgeLabel(
    currentRev?.letter ?? project.currentRevisionLetter,
  )

  return (
    <aside
      className={cn(
        "jobs-inspector flex h-full min-h-0 flex-col border-l border-bd bg-sr",
        "transition-transform duration-200 ease-out",
      )}
      style={{ width: INSPECTOR_W, maxWidth: "100%" }}
      aria-label={`Inspector for ${drawingNumber}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-bd px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn(Typography.DrawingNumber, "text-xl text-t1 truncate")}>
              {drawingNumber}
            </h2>
            <span className="rounded-md border border-bd bg-surface-low px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-t2">
              {revLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-t2 truncate">
            {client}
            <span className="text-t4"> · </span>
            {site}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-bd px-2 py-0.5 text-xs">
              <span className="text-t3">Project</span>
              <StatusBadge status={projectStatus === "ISSUED" ? "ISSUED" : "IN_DESIGN"} />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-bd px-2 py-0.5 text-xs">
              <span className="text-t3">Current Revision</span>
              <StatusBadge status={revStatus} />
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close inspector"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-bd px-4 py-3">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            if (workItemsModel) {
              onOpenWorkspace()
              return
            }
            setAddRevOpen(true)
          }}
          disabled={!workItemsModel && !project.canAddRevision && !jobDetail?.job}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Revision
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onOpenWorkspace}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload Drawing
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onOpenWorkspace}
        >
          <Send className="h-3.5 w-3.5" />
          Issue Drawing
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            window.location.href = `/quotes?new=1&jobId=${encodeURIComponent(project.detailId)}`
          }}
        >
          <FileText className="h-3.5 w-3.5" />
          Generate Quote
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onOpenWorkspace}
        >
          <Receipt className="h-3.5 w-3.5" />
          Generate Invoice
        </Button>
        <div className="relative">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(v => !v)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            More Actions
          </Button>
          {moreOpen && (
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-bd bg-sr py-1 shadow-modal">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-low"
                onClick={() => {
                  setMoreOpen(false)
                  onOpenWorkspace()
                }}
              >
                Open full workspace
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        key={project.id}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4"
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <JobsInspectorCurrentFocus
              revisionLabel={revLabel}
              currentTask={deriveNextAction(revStatus, project.requiredByDate)}
              designer={currentRev?.designer || project.designer}
              checker={null}
              dueDate={project.requiredByDate}
              status={revStatus}
            />
            <JobsInspectorMetrics {...metrics} />
            <JobsInspectorRevisionTimeline revisions={revisions} />
            <JobsInspectorWorkflow stages={workflow} />
            <JobsInspectorRecentFiles files={files} onReplace={() => onOpenWorkspace()} />
            <JobsInspectorActivityFeed items={activity} />
          </>
        )}
      </div>

      <div className="border-t border-bd p-4">
        <Button type="button" className="w-full" onClick={onOpenWorkspace}>
          Open Full Project
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <Suspense fallback={null}>
        {!workItemsModel && addRevOpen && jobDetail?.job && (
          <AddRevisionModal
            job={jobDetail.job}
            onClose={() => setAddRevOpen(false)}
            onSubmit={async (job, data) => {
              const parentId = job.parentJobId ?? job.id
              const res = await fetch(`/api/jobs/${parentId}/revisions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
              })
              if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string }
                throw new Error(body.error ?? "Failed to create revision")
              }
              setAddRevOpen(false)
            }}
          />
        )}
      </Suspense>
    </aside>
  )
}
