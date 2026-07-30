"use client"

import { useMemo, useState, lazy, Suspense } from "react"
import {
  Plus, Upload, Send, MoreHorizontal, ArrowRight,
} from "lucide-react"
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
import { WorkItemStatusSelector } from "./work-item-status-selector"
import {
  getCurrentWorkItem,
  type CurrentWorkRevisionLike,
} from "@/modules/jobs/lib/current-work"

const AddRevisionModal = lazy(() =>
  import("./add-revision-modal").then(m => ({ default: m.AddRevisionModal })),
)

interface JobsInspectorProps {
  project: JobsRegisterProject
  workItemsModel: boolean
  onOpenWorkspace: () => void
  onAddRevisionRequest?: () => void
  onStatusChanged?: () => void
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

function asSafeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function timeValue(value: string | null | undefined): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

export function JobsInspector({
  project,
  workItemsModel,
  onOpenWorkspace,
  onStatusChanged,
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

  const { data: parentDash, isLoading: parentLoading, mutate: mutateParent } = useApi<ParentJobDashboard>(parentKey)
  const { data: jobDetail, isLoading: jobLoading, mutate: mutateJob } = useApi<Job>(jobKey)
  const { data: revisionsData, mutate: mutateRevisions } = useApi<RevisionsResponse>(revisionsKey)
  const { data: historyData, mutate: mutateHistory } = useApi<HistoryResponse>(historyKey)
  const { data: docsData } = useApi<DocumentsResponse>(docsKey)

  const loading = workItemsModel ? parentLoading : jobLoading

  const revisions: InspectorRevision[] = useMemo(() => {
    if (workItemsModel && parentDash) {
      const workItems = asSafeArray(parentDash.workItems).filter(Boolean)
      const currentId = parentDash.currentActive?.id
      return [...workItems]
        .sort((a, b) => {
          const aDate = a.dateCreated || a.createdAt
          const bDate = b.dateCreated || b.createdAt
          return timeValue(bDate) - timeValue(aDate)
        })
        .map(wi => ({
          id: wi.id,
          letter: wi.revisionLetter,
          title: wi.title,
          status: wi.status,
          createdAt: wi.dateCreated || wi.createdAt,
          designer: wi.designer ?? "",
          reason: wi.description,
          notes: wi.notes,
          billable: wi.billable ?? true,
          value: wi.quoteValue,
          drawingStatus: shortStatusLabel(wi.status),
          invoiceStatus: wi.invoiceStatus ?? "Not invoiced",
          completionStatus: wi.completedAt ? "Complete" : shortStatusLabel(wi.status),
          isCurrent: wi.id === currentId,
        }))
    }

    const chain = asSafeArray(revisionsData?.chain).filter(Boolean)
    return chain.map((r, idx) => ({
      id: r.id,
      letter: r.revisionLetter,
      title: r.title || (r.revisionLetter ? `Revision ${r.revisionLetter}` : "Original Design"),
      status: r.status,
      createdAt: r.dateCreated,
      designer: r.designer ?? "",
      reason: r.notes,
      notes: r.notes,
      billable: r.billable ?? true,
      value: r.quoteValue ?? null,
      drawingStatus: shortStatusLabel(r.status),
      invoiceStatus: "Not invoiced",
      completionStatus: (r.dateCompleted || r.issuedAt) ? "Complete" : shortStatusLabel(r.status),
      isCurrent: r.isCurrent ?? idx === 0,
    }))
  }, [workItemsModel, parentDash, revisionsData])

  const currentRev = revisions.find(r => r.isCurrent) ?? revisions[0]

  const metrics = useMemo(() => {
    if (workItemsModel && parentDash) {
      const items = asSafeArray(parentDash.workItems)
      const invoiceSummary = parentDash.invoiceSummary ?? { quotedTotal: 0, billedTotal: 0 }
      const original = items.find(i => i.workType === "ORIGINAL")
      const revItems = items.filter(i => i.workType === "REVISION")
      const revisionRevenue = revItems.reduce((s, i) => s + (i.quoteValue ?? 0), 0)
      const originalFee = original?.quoteValue ?? null
      const total = invoiceSummary.quotedTotal
      const outstanding =
        invoiceSummary.quotedTotal - invoiceSummary.billedTotal
      return {
        originalFee,
        revisionRevenue,
        totalValue: total || null,
        outstanding: outstanding > 0 ? outstanding : 0,
        revisionCount: parentDash.revisionCount,
        lastActivity: items.map(i => i.updatedAt).sort().at(-1) ?? null,
      }
    }

    const job = jobDetail
    const chain = asSafeArray(revisionsData?.chain)
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
    const docs = asSafeArray(docsData?.documents)
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
        d => /draw|dwg/i.test(String(d.filename ?? "")) || /drawing/i.test(d.category ?? ""),
        "Latest Drawing",
        "drawing",
      ),
      pick(
        d => /calc/i.test(String(d.filename ?? "")) || /calc/i.test(d.category ?? ""),
        "Latest Calculation",
        "calculation",
      ),
      pick(
        d => /\.pdf$/i.test(String(d.filename ?? "")) || /pdf|revision/i.test(d.category ?? ""),
        "Latest Revision PDF",
        "pdf",
      ),
    ].filter(Boolean) as InspectorFileItem[]
  }, [docsData, docJobId])

  const activity: InspectorActivityItem[] = useMemo(() => {
    return asSafeArray(historyData?.history).slice(0, 12).map(h => ({
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
  const client = parent?.clientCompany ?? jobDetail?.clientCompany ?? project.clientCompany
  const site = siteDisplay(
    parent?.siteName ?? jobDetail?.siteName ?? project.siteName,
    parent?.address ?? jobDetail?.address ?? project.address,
  )
  const drawingNumber =
    parent?.drawingNumber ?? jobDetail?.drawingNumber ?? project.drawingNumber

  const originalWorkItem = workItemsModel
    ? parentDash?.workItems.find(w => w.workType === "ORIGINAL") ?? null
    : null
  const originalStatus = workItemsModel
    ? (originalWorkItem?.status ?? project.projectStatus)
    : (jobDetail?.status ?? project.projectStatus)
  const originalId = workItemsModel
    ? (originalWorkItem?.id ?? null)
    : project.id

  const currentWork = useMemo(() => {
    const revLike: CurrentWorkRevisionLike[] = revisions
      .filter(r => Boolean(r.letter))
      .map(r => ({
        id: r.id,
        revisionLetter: r.letter,
        status: r.status,
        designer: r.designer,
        requiredByDate: null,
      }))
    return getCurrentWorkItem(
      {
        id: project.id,
        status: originalStatus,
        designer: project.designer,
        requiredByDate: project.requiredByDate,
      },
      revLike,
    )
  }, [revisions, project.id, project.designer, project.requiredByDate, originalStatus])

  const revStatus = currentWork.status
  const revLabel = revisionBadgeLabel(
    currentWork.type === "revision"
      ? (currentRev?.letter ?? project.currentRevisionLetter)
      : null,
  )

  const refreshAfterStatus = async () => {
    if (workItemsModel) {
      await mutateParent()
    } else {
      await Promise.all([mutateJob(), mutateRevisions()])
    }
    await mutateHistory()
    onStatusChanged?.()
  }

  const currentWorkPatchUrl = workItemsModel && currentWork.id
    ? `/api/work-items/${currentWork.id}`
    : undefined
  const originalPatchUrl = workItemsModel && originalId
    ? `/api/work-items/${originalId}`
    : undefined

  return (
    <aside
      className={cn(
        "jobs-inspector flex h-full min-h-0 w-full flex-col bg-sr",
      )}
      aria-label={`Inspector for ${drawingNumber}`}
    >
      {/* Header — identity + summary */}
      <div className="shrink-0 border-b border-bd px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-xl font-bold tracking-tight text-t1">
              {drawingNumber}
            </h3>
            <p className="mt-0.5 truncate text-sm">
              <span className="font-medium text-t1">{client}</span>
              <span className="text-t4"> · </span>
              <span className="text-t3">{site}</span>
            </p>
            <p className="mt-1 truncate text-xs text-t3">
              Original {shortStatusLabel(originalStatus)}
              {currentWork.type === "revision" ? (
                <>
                  {" · "}
                  <span className="font-medium text-t2">
                    {currentWork.revisionLabel ?? revLabel}
                  </span>
                  {" — "}
                  {shortStatusLabel(currentWork.status)}
                </>
              ) : currentWork.type === "original" ? (
                <> · Active original</>
              ) : (
                <> · No active work</>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded border border-bd px-2 text-xs font-medium text-t2 transition-colors hover:bg-surface-low hover:text-t1"
              onClick={onOpenWorkspace}
            >
              Open Full Project
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded border border-bd p-1.5 text-t3 transition-colors hover:bg-surface-low hover:text-t1"
              aria-label="More actions"
              onClick={onOpenWorkspace}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded bg-ac px-3 text-xs font-semibold text-on-ac transition-colors hover:bg-ach disabled:opacity-50"
            onClick={() => {
              if (workItemsModel) {
                onOpenWorkspace()
                return
              }
              setAddRevOpen(true)
            }}
            disabled={!workItemsModel && !project.canAddRevision && !jobDetail}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Revision
          </button>
          <IconBtn title="Upload" onClick={onOpenWorkspace}><Upload className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="Issue" onClick={onOpenWorkspace}><Send className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="More" onClick={onOpenWorkspace}><MoreHorizontal className="h-3.5 w-3.5" /></IconBtn>
        </div>

        {/* Compact dual status cards */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded border border-bd bg-surface-low/80 p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-t3">
              Original Design
            </p>
            {originalId ? (
              <WorkItemStatusSelector
                workItemType="original"
                workItemId={originalId}
                currentStatus={originalStatus}
                revisionLabel={null}
                patchUrl={originalPatchUrl}
                size="md"
                onStatusChanged={() => { void refreshAfterStatus() }}
              />
            ) : (
              <span className="text-sm text-t3">Not available</span>
            )}
          </div>
          <div className="rounded border border-bd bg-sr p-2.5">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-t3">
              Current Work
            </p>
            {currentWork.type !== "none" && (
              <p className="mb-1 text-xs font-medium text-t2">
                {currentWork.revisionLabel ?? "ORIGINAL"}
              </p>
            )}
            {currentWork.type !== "none" && currentWork.id ? (
              <WorkItemStatusSelector
                workItemType={currentWork.type === "revision" ? "revision" : "original"}
                workItemId={currentWork.id}
                currentStatus={currentWork.status}
                revisionLabel={currentWork.type === "revision" ? currentWork.revisionLabel : null}
                patchUrl={currentWorkPatchUrl}
                size="md"
                onStatusChanged={() => { void refreshAfterStatus() }}
              />
            ) : (
              <p className="text-sm text-t3">No Active Work</p>
            )}
            {currentWork.multipleActiveWarning && (
              <p className="mt-1.5 text-[11px] text-wn-tx">
                Multiple active revisions — showing latest by sequence.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex shrink-0 overflow-x-auto border-b border-bd" aria-label="Inspector sections">
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
              "whitespace-nowrap px-3.5 py-2.5 text-xs font-medium transition-colors",
              tab === id
                ? "border-b-2 border-ac font-bold text-t1"
                : "text-t3 hover:text-t1",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div key={project.id} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
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
                revisionLabel={
                  currentWork.type === "none"
                    ? "Complete"
                    : (currentWork.revisionLabel ?? revLabel)
                }
                currentTask={
                  currentWork.type === "none"
                    ? "No active work"
                    : deriveNextAction(revStatus, project.requiredByDate)
                }
                designer={currentRev?.designer || project.designer}
                checker={null}
                dueDate={project.requiredByDate}
                status={revStatus}
                nextAction={
                  currentWork.type === "none"
                    ? null
                    : (project.nextAction &&
                        project.nextAction !== deriveNextAction(revStatus, project.requiredByDate)
                        ? project.nextAction
                        : null)
                }
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

      <Suspense fallback={null}>
        {!workItemsModel && addRevOpen && jobDetail && (
          <AddRevisionModal
            job={jobDetail}
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
      className="inline-flex h-8 items-center gap-1.5 rounded border border-bd px-2.5 text-xs font-medium text-t2 transition-colors hover:bg-surface-low hover:text-t1"
    >
      {children}
      <span>{title}</span>
    </button>
  )
}
