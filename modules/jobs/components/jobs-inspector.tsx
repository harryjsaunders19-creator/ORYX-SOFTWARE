"use client"

import { useMemo, useState, lazy, Suspense } from "react"
import {
  X, Plus, Upload, Send, FileText, MoreHorizontal, ArrowRight,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { useApi } from "@/shared/hooks/use-api"
import { cn } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { JobsRegisterProject } from "./jobs-register-types"
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
  const [tab, setTab] = useState<"overview" | "revisions" | "commercial" | "documents" | "activity">("revisions")

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
        "jobs-inspector flex h-full min-h-0 w-full flex-col bg-sr",
        "border-l border-bd",
      )}
      style={{ boxShadow: "-4px 0 24px rgba(0,0,0,0.02)" }}
      aria-label={`Inspector for ${drawingNumber}`}
    >
      {/* Quick actions — Stitch sticky toolbar */}
      <div className="sticky top-0 z-30 border-b border-bd bg-sr p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            onClick={() => {
              if (workItemsModel) {
                onOpenWorkspace()
                return
              }
              setAddRevOpen(true)
            }}
            disabled={!workItemsModel && !project.canAddRevision && !jobDetail?.job}
          >
            <Plus className="h-[18px] w-[18px]" />
            Add Revision
          </button>
          <div className="flex gap-1">
            <IconBtn title="Upload Drawing" onClick={onOpenWorkspace}><Upload className="h-5 w-5" /></IconBtn>
            <IconBtn title="Issue Drawing" onClick={onOpenWorkspace}><Send className="h-5 w-5" /></IconBtn>
            <IconBtn title="Generate Quote" onClick={() => { window.location.href = `/quotes?new=1&jobId=${encodeURIComponent(project.detailId)}` }}><FileText className="h-5 w-5" /></IconBtn>
            <IconBtn title="More" onClick={onOpenWorkspace}><MoreHorizontal className="h-5 w-5" /></IconBtn>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-bd px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-2xl font-bold tracking-tight text-t1 truncate">{drawingNumber}</h3>
              <span className="rounded border border-bd bg-surface-low px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-t3">
                {revLabel}
              </span>
            </div>
            <p className="mt-1 text-sm">
              <span className="font-semibold text-t1">{client}</span>
              <span className="text-t4"> / </span>
              <span className="text-t3">{site}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded border border-green-200 bg-green-50 px-3 py-1 text-[10px] font-bold text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
                PROJECT: {projectStatus === "ISSUED" ? "COMPLETED" : "ACTIVE"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-700">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" aria-hidden />
                CURR. REV: {shortStatusLabel(revStatus).toUpperCase()}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1.5 text-t3 hover:bg-surface-low hover:text-t1"
            aria-label="Close inspector"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex border-b border-bd overflow-x-auto" aria-label="Inspector sections">
        {(
          [
            ["overview", "Overview"],
            ["revisions", "Revisions"],
            ["commercial", "Commercial"],
            ["documents", "Documents"],
            ["activity", "Activity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors",
              tab === id
                ? "border-b-2 border-ac text-t1 font-bold"
                : "text-t3 hover:text-t1",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div key={project.id} className="min-h-0 flex-1 space-y-8 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 skeleton rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {(tab === "overview" || tab === "revisions") && (
              <JobsInspectorCurrentFocus
                revisionLabel={revLabel}
                currentTask={deriveNextAction(revStatus, project.requiredByDate)}
                designer={currentRev?.designer || project.designer}
                checker={null}
                dueDate={project.requiredByDate}
                status={revStatus}
              />
            )}
            {(tab === "overview" || tab === "commercial") && (
              <JobsInspectorMetrics {...metrics} />
            )}
            {(tab === "overview" || tab === "revisions") && (
              <JobsInspectorRevisionTimeline revisions={revisions} />
            )}
            {tab === "overview" && <JobsInspectorWorkflow stages={workflow} />}
            {(tab === "overview" || tab === "documents") && (
              <JobsInspectorRecentFiles files={files} onReplace={() => onOpenWorkspace()} />
            )}
            {(tab === "overview" || tab === "activity") && (
              <JobsInspectorActivityFeed items={activity} />
            )}
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

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded border border-bd p-2 text-t2 hover:bg-surface-low transition-colors"
    >
      {children}
    </button>
  )
}
