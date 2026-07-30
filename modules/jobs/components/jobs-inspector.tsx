"use client"

import { useMemo, useState, lazy, Suspense } from "react"
import {
  Plus, ShieldCheck, Link2, ArrowRight, ChevronDown,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { cn, formatGBP } from "@/shared/utils/utils"
import type { Job, LinkedQuoteSummary, Quote } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { JobsRegisterProject } from "./jobs-register-types"
import {
  deriveNextAction,
  revisionBadgeLabel,
  siteDisplay,
  shortStatusLabel,
  missingLabel,
} from "./jobs-register-helpers"
import { WorkItemStatusSelector } from "./work-item-status-selector"
import { DesignerAssignmentSelector } from "./designer-assignment-selector"
import { downloadCat2CheckSheet } from "./cat2-check-sheet-export"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import {
  getCurrentWorkItem,
  type CurrentWorkRevisionLike,
} from "@/modules/jobs/lib/current-work"
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge"

const AddRevisionModal = lazy(() =>
  import("./add-revision-modal").then(m => ({ default: m.AddRevisionModal })),
)
const AttachExistingQuoteModal = lazy(() =>
  import("./attach-existing-quote-modal").then(m => ({ default: m.AttachExistingQuoteModal })),
)

interface JobsInspectorProps {
  project: JobsRegisterProject
  workItemsModel: boolean
  designers: string[]
  onOpenWorkspace: () => void
  onStatusChanged?: () => void
}

interface DocumentsResponse {
  documents: {
    id: string
    filename: string
    originalFilename?: string | null
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

interface QuotesListResponse {
  quotes: Quote[]
}

function asSafeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function timeValue(value: string | null | undefined): number {
  if (!value) return 0
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

function safeDateLabel(value: string | null | undefined): string {
  if (!value) return "Unknown date"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "Unknown date"
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function dueLabel(value: string | null | undefined): string {
  if (!value) return "Not set"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "Not set"
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0) return "Overdue"
  if (diff === 0) return "Today"
  if (diff <= 7) return "This week"
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

type CompactRevision = {
  id: string
  letter: string | null
  title: string
  status: string
  createdAt: string
  designer: string
  reason: string | null
  billable: boolean
  isCurrent: boolean
}

export function JobsInspector({
  project,
  workItemsModel,
  designers,
  onOpenWorkspace,
  onStatusChanged,
}: JobsInspectorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [addRevOpen, setAddRevOpen] = useState(false)
  const [attachQuoteOpen, setAttachQuoteOpen] = useState(false)
  const [cat2Busy, setCat2Busy] = useState(false)
  const [unlinkBusy, setUnlinkBusy] = useState(false)

  const parentKey = workItemsModel ? `/api/parent-jobs/${project.id}` : null
  const jobKey = !workItemsModel ? `/api/jobs/${project.id}?include=parent,current` : null
  const revisionsKey = !workItemsModel ? `/api/jobs/${project.id}/revisions` : null
  const docsKey = `/api/jobs/${project.id}/documents?limit=20`
  const quotesKey = `/api/quotes?search=${encodeURIComponent(project.drawingNumber)}&page=1&limit=20`

  const { data: parentDash, isLoading: parentLoading, mutate: mutateParent } =
    useApi<ParentJobDashboard>(parentKey)
  const { data: jobDetail, isLoading: jobLoading, mutate: mutateJob } =
    useApi<Job>(jobKey)
  const { data: revisionsData, mutate: mutateRevisions } =
    useApi<RevisionsResponse>(revisionsKey)
  const { data: docsData, mutate: mutateDocs } = useApi<DocumentsResponse>(docsKey)
  const { data: quotesData, mutate: mutateQuotes } = useApi<QuotesListResponse>(quotesKey)

  const loading = workItemsModel ? parentLoading : jobLoading

  const revisions: CompactRevision[] = useMemo(() => {
    if (workItemsModel && parentDash) {
      const workItems = asSafeArray(parentDash.workItems).filter(Boolean)
      const currentId = parentDash.currentActive?.id
      return [...workItems]
        .sort((a, b) => timeValue(b.dateCreated || b.createdAt) - timeValue(a.dateCreated || a.createdAt))
        .map(wi => ({
          id: wi.id,
          letter: wi.revisionLetter,
          title: wi.title || (wi.revisionLetter ? `Rev ${wi.revisionLetter}` : "Original"),
          status: wi.status,
          createdAt: wi.dateCreated || wi.createdAt,
          designer: wi.designer ?? "",
          reason: wi.description,
          billable: wi.billable ?? true,
          isCurrent: wi.id === currentId,
        }))
    }
    return asSafeArray(revisionsData?.chain).filter(Boolean).map((r, idx) => ({
      id: r.id,
      letter: r.revisionLetter,
      title: r.title || (r.revisionLetter ? `Rev ${r.revisionLetter}` : "Original"),
      status: r.status,
      createdAt: r.dateCreated,
      designer: r.designer ?? "",
      reason: r.notes,
      billable: r.billable ?? true,
      isCurrent: r.isCurrent ?? idx === 0,
    }))
  }, [workItemsModel, parentDash, revisionsData])

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

  const currentRev = revisions.find(r => r.isCurrent) ?? revisions[0]
  const revLabel = revisionBadgeLabel(
    currentWork.type === "revision"
      ? (currentRev?.letter ?? project.currentRevisionLetter)
      : null,
  )

  const linkedQuote: LinkedQuoteSummary | null = useMemo(() => {
    if (jobDetail?.currentQuote) return jobDetail.currentQuote
    if (project.currentQuote) {
      return {
        ...project.currentQuote,
        updatedAt: "",
      }
    }
    const match = asSafeArray(quotesData?.quotes).find(q => q.jobId === project.id)
    if (!match) return null
    return {
      id: match.id,
      quoteNumber: match.quoteNumber,
      quoteValue: match.quoteValue ?? 0,
      status: match.status,
      updatedAt: match.updatedAt ?? "",
    }
  }, [jobDetail?.currentQuote, project.currentQuote, project.id, quotesData?.quotes])

  const cat2Doc = useMemo(() => {
    return asSafeArray(docsData?.documents).find(d => {
      const name = `${d.originalFilename ?? ""} ${d.filename ?? ""}`
      return /cat\s*ii|cat2|catii/i.test(name)
    }) ?? null
  }, [docsData?.documents])

  const canExportCat2 = useMemo(() => {
    if (workItemsModel && parentDash) {
      return asSafeArray(parentDash.workItems).some(w => w.status === "ISSUED")
    }
    return (
      originalStatus === "ISSUED" ||
      project.projectStatus === "ISSUED" ||
      revisions.some(r => r.status === "ISSUED")
    )
  }, [workItemsModel, parentDash, originalStatus, project.projectStatus, revisions])

  const cat2TargetLabel = useMemo(() => {
    const issuedRev = [...revisions]
      .filter(r => r.status === "ISSUED" && r.letter)
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))[0]
    if (issuedRev?.letter) return `Rev ${issuedRev.letter}`
    if (currentWork.type === "revision" && currentWork.revisionLabel) {
      return currentWork.revisionLabel
    }
    return "original design"
  }, [revisions, currentWork])

  const refreshAll = async () => {
    if (workItemsModel) await mutateParent()
    else await Promise.all([mutateJob(), mutateRevisions()])
    await Promise.all([mutateDocs(), mutateQuotes()])
    onStatusChanged?.()
  }

  const currentWorkPatchUrl = workItemsModel && currentWork.id
    ? `/api/work-items/${currentWork.id}`
    : undefined

  const handleCat2 = async () => {
    setCat2Busy(true)
    try {
      const result = await downloadCat2CheckSheet(project.id)
      if (!result.ok) {
        toast(result.error, "error")
        return
      }
      toast(`CAT II Check created for ${cat2TargetLabel}`, "success")
      await mutateDocs()
      onStatusChanged?.()
    } catch {
      toast("CAT II export failed", "error")
    } finally {
      setCat2Busy(false)
    }
  }

  const handleUnlinkQuote = async () => {
    if (!linkedQuote) return
    setUnlinkBusy(true)
    try {
      const res = await fetch(`/api/quotes/${linkedQuote.id}/link-job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to remove quote link", "error")
        return
      }
      toast("Quote unlinked", "success")
      await refreshAll()
    } catch {
      toast("Network error", "error")
    } finally {
      setUnlinkBusy(false)
    }
  }

  const attachJobStub = {
    id: project.id,
    drawingNumber,
  } as Job

  const actionBtn =
    "inline-flex h-8 items-center gap-1.5 rounded border border-bd bg-sr px-2.5 text-xs font-medium text-t1 transition-colors hover:bg-surface-low disabled:opacity-50"

  return (
    <aside
      className="jobs-inspector flex h-full min-h-0 w-full flex-col bg-sr"
      aria-label={`Inspector for ${drawingNumber}`}
    >
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
                <> · Complete</>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={cn(actionBtn, "border-transparent bg-ac text-on-ac hover:bg-ach")}
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
          <button
            type="button"
            className={actionBtn}
            onClick={() => void handleCat2()}
            disabled={cat2Busy || !canExportCat2}
            title={
              canExportCat2
                ? `Create CATII Check for ${cat2TargetLabel}`
                : "CATII Check is available when original or a revision is complete"
            }
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {cat2Busy ? "Creating…" : "CATII Check"}
          </button>
          <button
            type="button"
            className={actionBtn}
            onClick={() => setAttachQuoteOpen(true)}
          >
            <Link2 className="h-3.5 w-3.5" />
            Attach Quote
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={actionBtn}>
                More
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpenWorkspace}>
                Open Full Project
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  window.location.href = `/quotes?new=1&jobId=${encodeURIComponent(project.id)}`
                }}
              >
                Create New Quote
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => router.push(`/jobs/${project.id}`)}
              >
                Generate Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div key={project.id} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 skeleton rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <CurrentWorkSummary
              currentWork={currentWork}
              revLabel={revLabel}
              designer={currentRev?.designer || project.designer}
              designers={designers}
              dueDate={project.requiredByDate}
              patchUrl={currentWorkPatchUrl}
              onChanged={() => { void refreshAll() }}
            />

            <LinkedQuotationSummary
              quote={linkedQuote}
              unlinkBusy={unlinkBusy}
              onAttach={() => setAttachQuoteOpen(true)}
              onOpen={() => {
                if (!linkedQuote) return
                router.push(`/quotes?search=${encodeURIComponent(linkedQuote.quoteNumber)}`)
              }}
              onChange={() => setAttachQuoteOpen(true)}
              onUnlink={() => { void handleUnlinkQuote() }}
            />

            <CATIICheckSummary
              doc={cat2Doc}
              busy={cat2Busy}
              canCreate={canExportCat2}
              targetLabel={cat2TargetLabel}
              onCreate={() => { void handleCat2() }}
              onOpen={() => {
                if (!cat2Doc) return
                window.open(`/api/jobs/${project.id}/documents/${cat2Doc.id}/preview`, "_blank")
              }}
            />

            <RevisionHistory revisions={revisions} />
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-bd px-4 py-2">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-t3 transition-colors hover:bg-surface-low hover:text-t1"
          onClick={onOpenWorkspace}
        >
          Open Full Project
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
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
              await refreshAll()
            }}
          />
        )}
        {attachQuoteOpen && (
          <AttachExistingQuoteModal
            job={attachJobStub}
            open={attachQuoteOpen}
            onClose={() => setAttachQuoteOpen(false)}
            onLinked={async () => {
              await refreshAll()
            }}
          />
        )}
      </Suspense>
    </aside>
  )
}

function CurrentWorkSummary({
  currentWork,
  revLabel,
  designer,
  designers,
  dueDate,
  patchUrl,
  onChanged,
}: {
  currentWork: ReturnType<typeof getCurrentWorkItem>
  revLabel: string
  designer: string
  designers: string[]
  dueDate: string | null
  patchUrl?: string
  onChanged: () => void
}) {
  const active = currentWork.type !== "none" && Boolean(currentWork.id)
  const label =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : currentWork.type === "original"
        ? "Original"
        : "Complete"

  return (
    <section className="rounded-lg border border-[#2e3238] bg-[#1c1f24] p-3.5 text-[#f4f4f5]">
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
        Current Work
      </h4>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[#fafafa]">{label}</span>
        {active ? (
          <WorkItemStatusSelector
            workItemType={currentWork.type === "revision" ? "revision" : "original"}
            workItemId={currentWork.id!}
            currentStatus={currentWork.status}
            revisionLabel={currentWork.type === "revision" ? currentWork.revisionLabel : null}
            patchUrl={patchUrl}
            size="md"
            onStatusChanged={onChanged}
          />
        ) : (
          <span className="text-sm text-[#d4d4d8]">Complete</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="mb-1 text-xs text-[#a1a1aa]">Designer</p>
          {active ? (
            <DesignerAssignmentSelector
              workItemType={currentWork.type === "revision" ? "revision" : "original"}
              workItemId={currentWork.id!}
              currentDesigner={designer}
              revisionLabel={currentWork.type === "revision" ? currentWork.revisionLabel : null}
              designers={designers}
              patchUrl={patchUrl}
              compact
              className="text-[#f4f4f5] [&_span]:bg-white/10 [&_span]:text-[#f4f4f5]"
              onDesignerChanged={onChanged}
            />
          ) : (
            <p className="text-[#d4d4d8]">{missingLabel(designer, "Unassigned")}</p>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs text-[#a1a1aa]">Checker</p>
          <p className="text-[#d4d4d8]">Not assigned</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-[#a1a1aa]">Due</p>
          <p className="text-[#f4f4f5]">{dueLabel(dueDate)}</p>
        </div>
        <div>
          <p className="mb-1 text-xs text-[#a1a1aa]">Next action</p>
          <p className="text-[#f4f4f5]">
            {active
              ? deriveNextAction(currentWork.status, dueDate)
              : "No active work"}
          </p>
        </div>
      </div>
    </section>
  )
}

function LinkedQuotationSummary({
  quote,
  unlinkBusy,
  onAttach,
  onOpen,
  onChange,
  onUnlink,
}: {
  quote: LinkedQuoteSummary | null
  unlinkBusy: boolean
  onAttach: () => void
  onOpen: () => void
  onChange: () => void
  onUnlink: () => void
}) {
  return (
    <section className="rounded-lg border border-bd bg-surface-low/50 p-3.5">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-t3">
        Quotation
      </h4>
      {quote ? (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-t1">{quote.quoteNumber}</p>
              <p className="mt-0.5 text-sm text-t2">
                {formatGBP(quote.quoteValue)}
                <span className="text-t4"> · </span>
                <QuoteStatusBadge status={quote.status} />
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="text-xs font-medium text-ac2 hover:underline" onClick={onOpen}>
              Open Quote
            </button>
            <button type="button" className="text-xs font-medium text-t2 hover:underline" onClick={onChange}>
              Change
            </button>
            <button
              type="button"
              className="text-xs font-medium text-t3 hover:underline disabled:opacity-50"
              onClick={onUnlink}
              disabled={unlinkBusy}
            >
              {unlinkBusy ? "Removing…" : "Remove Link"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-t3">No quotation attached</p>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded border border-bd px-2 text-xs font-medium text-t1 hover:bg-sr"
            onClick={onAttach}
          >
            Attach Quote
          </button>
        </div>
      )}
    </section>
  )
}

function CATIICheckSummary({
  doc,
  busy,
  canCreate,
  targetLabel,
  onCreate,
  onOpen,
}: {
  doc: { id: string; filename: string; originalFilename?: string | null; createdAt: string } | null
  busy: boolean
  canCreate: boolean
  targetLabel: string
  onCreate: () => void
  onOpen: () => void
}) {
  const label = doc?.originalFilename || doc?.filename || "CAT II Check Sheet"
  return (
    <section className="rounded-lg border border-bd bg-surface-low/50 p-3.5">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-t3">
        CATII Check
      </h4>
      {doc ? (
        <div className="space-y-2">
          <p className="truncate text-sm font-semibold text-t1">{label}</p>
          <p className="text-xs text-t3">
            Created {safeDateLabel(doc.createdAt)} · {targetLabel}
          </p>
          <button type="button" className="text-xs font-medium text-ac2 hover:underline" onClick={onOpen}>
            Open Check
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-t3">No check created</p>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded border border-bd px-2 text-xs font-medium text-t1 hover:bg-sr disabled:opacity-50"
            onClick={onCreate}
            disabled={busy || !canCreate}
            title={
              canCreate
                ? `Create CATII Check for ${targetLabel}`
                : "Available when work is complete"
            }
          >
            {busy ? "Creating…" : "Create CATII Check"}
          </button>
        </div>
      )}
    </section>
  )
}

function RevisionHistory({ revisions }: { revisions: CompactRevision[] }) {
  return (
    <section>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-t3">
        Revision History
      </h4>
      {revisions.length === 0 ? (
        <p className="text-sm text-t3">Original design only</p>
      ) : (
        <ul className="space-y-2">
          {revisions.map(rev => {
            const title = rev.letter ? `Rev ${rev.letter}` : "Original"
            return (
              <li
                key={rev.id}
                className={cn(
                  "rounded-lg border border-bd px-3 py-2.5",
                  rev.isCurrent ? "border-l-[3px] border-l-ac2 bg-surface-low" : "bg-sr",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-t1">
                      {title}
                      {rev.isCurrent && (
                        <span className="ml-2 text-[10px] font-medium uppercase text-ac2">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-t3">
                      {shortStatusLabel(rev.status)}
                      {" · "}
                      {missingLabel(rev.designer, "Unassigned")}
                    </p>
                    <p className="mt-0.5 text-xs text-t3">{safeDateLabel(rev.createdAt)}</p>
                    {rev.reason?.trim() && (
                      <p className="mt-1 truncate text-xs text-t2">{rev.reason.trim()}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded border border-bd px-1.5 py-0.5 text-[10px] font-medium text-t3">
                    {rev.billable ? "Chargeable" : "Free"}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
