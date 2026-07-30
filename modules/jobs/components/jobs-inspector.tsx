"use client"

import { useMemo, useState, lazy, Suspense } from "react"
import {
  MoreHorizontal, Plus, ShieldCheck, Link2, ChevronLeft,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { cn } from "@/shared/utils/utils"
import type { Job, LinkedQuoteSummary, Quote } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { JobsRegisterProject } from "./jobs-register-types"
import {
  deriveNextAction,
  revisionBadgeLabel,
  siteDisplay,
} from "./jobs-register-helpers"
import { downloadCat2CheckSheet } from "./cat2-check-sheet-export"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import {
  getCurrentWorkItem,
  type CurrentWorkRevisionLike,
} from "@/modules/jobs/lib/current-work"
import {
  InspectorHeader,
  StatusChip,
  CurrentFocusSection,
  ProjectDetailsSection,
  RevisionDetailsSection,
  CommercialSummary,
  QuotationSummary,
  CATIISummary,
  RevisionTimeline,
  type HistoryRevision,
  type QuoteCardItem,
  type Cat2Summary,
} from "./jobs-inspector-cards"
import { JobsInspectorCollapseButton } from "./jobs-inspector-shell"

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
  onStatusChanged?: () => void
  onCollapse?: () => void
  collapseVariant?: "chevron" | "close"
  /** Mobile drawer uses stacked actions and a back control. */
  presentation?: "panel" | "drawer"
}

interface DocumentsResponse {
  documents: {
    id: string
    filename: string
    originalFilename?: string | null
    createdAt: string
    revisionLetter?: string | null
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
    requestedBy?: string | null
    requestedDate?: string | null
  }[]
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

function toQuoteCard(
  q: Pick<Quote, "id" | "quoteNumber" | "quoteValue" | "status"> | LinkedQuoteSummary,
  scopeLabel?: string,
): QuoteCardItem {
  return {
    id: q.id,
    quoteNumber: q.quoteNumber,
    quoteValue: q.quoteValue ?? 0,
    status: q.status,
    updatedAt: "updatedAt" in q ? String(q.updatedAt ?? "") : "",
    scopeLabel,
  }
}

export function JobsInspector({
  project,
  workItemsModel,
  designers,
  onStatusChanged,
  onCollapse,
  collapseVariant = "chevron",
  presentation = "panel",
}: JobsInspectorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [addRevOpen, setAddRevOpen] = useState(false)
  const [wiRevOpen, setWiRevOpen] = useState(false)
  const [wiRevReason, setWiRevReason] = useState("")
  const [wiRevBillable, setWiRevBillable] = useState(true)
  const [wiRevSaving, setWiRevSaving] = useState(false)
  const [attachQuoteOpen, setAttachQuoteOpen] = useState(false)
  const [cat2Busy, setCat2Busy] = useState(false)
  const [unlinkBusy, setUnlinkBusy] = useState(false)

  const parentKey = workItemsModel ? `/api/parent-jobs/${project.id}` : null
  const jobKey = !workItemsModel ? `/api/jobs/${project.id}?include=parent,current` : null
  const revisionsKey = !workItemsModel ? `/api/jobs/${project.id}/revisions` : null
  const docsKey = `/api/jobs/${project.id}/documents?limit=40`
  const quotesKey = `/api/quotes?search=${encodeURIComponent(project.drawingNumber)}&page=1&limit=25`

  const { data: parentDash, isLoading: parentLoading, mutate: mutateParent } =
    useApi<ParentJobDashboard>(parentKey)
  const { data: jobDetail, isLoading: jobLoading, mutate: mutateJob } =
    useApi<Job>(jobKey)
  const { data: revisionsData, mutate: mutateRevisions } =
    useApi<RevisionsResponse>(revisionsKey)
  const { data: docsData, mutate: mutateDocs } = useApi<DocumentsResponse>(docsKey)
  const { data: quotesData, mutate: mutateQuotes } = useApi<QuotesListResponse>(quotesKey)

  const loading = workItemsModel ? parentLoading : jobLoading

  const parent = parentDash?.parent
  const originalWorkItem = workItemsModel
    ? parentDash?.workItems.find(w => w.workType === "ORIGINAL") ?? null
    : null

  type RichRevision = HistoryRevision & {
    requestedBy: string | null
    requestedDate: string | null
    legacyJobId: string | null
  }

  const revisions: RichRevision[] = useMemo(() => {
    if (workItemsModel && parentDash) {
      const workItems = asSafeArray(parentDash.workItems).filter(Boolean)
      const currentId = parentDash.currentActive?.id
      const quotes = asSafeArray(quotesData?.quotes)
      const docs = asSafeArray(docsData?.documents)
      return [...workItems]
        .sort((a, b) => timeValue(b.dateCreated || b.createdAt) - timeValue(a.dateCreated || a.createdAt))
        .map(wi => {
          const letter = wi.revisionLetter
          const quote = quotes.find(q => {
            if (!q.jobId) return false
            if (wi.workType === "ORIGINAL") {
              return q.jobId === project.id || q.jobId === wi.legacyJobId
            }
            return q.jobId === wi.legacyJobId
          }) ?? null
          const hasCat2 = docs.some(d => {
            const name = `${d.originalFilename ?? ""} ${d.filename ?? ""}`
            if (!/cat\s*ii|cat2|catii/i.test(name)) return false
            if (letter && new RegExp(`rev\\s*${letter}\\b`, "i").test(name)) return true
            if (!letter && !new RegExp("rev\\s*[a-z]", "i").test(name)) return true
            return Boolean(d.revisionLetter && letter && d.revisionLetter === letter)
          })
          return {
            id: wi.id,
            letter,
            title: wi.title || (letter ? `Rev ${letter}` : "Original"),
            status: wi.status,
            createdAt: wi.dateCreated || wi.createdAt,
            designer: wi.designer ?? "",
            reason: wi.description ?? wi.notes,
            billable: wi.billable ?? true,
            fee: wi.quoteValue ?? null,
            quoteNumber: quote?.quoteNumber ?? wi.quoteReference ?? null,
            hasCat2,
            isCurrent: wi.id === currentId,
            requestedBy: parent?.requestedBy ?? null,
            requestedDate: wi.requestedDate,
            legacyJobId: wi.legacyJobId,
          }
        })
    }

    const docs = asSafeArray(docsData?.documents)
    const quotes = asSafeArray(quotesData?.quotes)
    return asSafeArray(revisionsData?.chain).filter(Boolean).map((r, idx) => {
      const letter = r.revisionLetter
      const quote = quotes.find(q => q.jobId === r.id) ?? null
      const hasCat2 = docs.some(d => {
        const name = `${d.originalFilename ?? ""} ${d.filename ?? ""}`
        if (!/cat\s*ii|cat2|catii/i.test(name)) return false
        if (letter && new RegExp(`rev\\s*${letter}\\b`, "i").test(name)) return true
        if (!letter && !new RegExp("rev\\s*[a-z]", "i").test(name)) return true
        return false
      })
      return {
        id: r.id,
        letter,
        title: r.title || (letter ? `Rev ${letter}` : "Original"),
        status: r.status,
        createdAt: r.dateCreated,
        designer: r.designer ?? "",
        reason: r.notes,
        billable: r.billable ?? true,
        fee: r.quoteValue ?? null,
        quoteNumber: quote?.quoteNumber ?? null,
        hasCat2,
        isCurrent: r.isCurrent ?? idx === 0,
        requestedBy: r.requestedBy ?? jobDetail?.requestedBy ?? null,
        requestedDate: r.requestedDate ?? null,
        legacyJobId: r.id,
      }
    })
  }, [workItemsModel, parentDash, revisionsData, quotesData, docsData, project.id, parent?.requestedBy, jobDetail?.requestedBy])

  const client = parent?.clientCompany ?? jobDetail?.clientCompany ?? project.clientCompany
  const siteName = parent?.siteName ?? jobDetail?.siteName ?? project.siteName
  const siteAddress =
    parent?.siteAddress
    ?? parent?.address
    ?? jobDetail?.siteAddress
    ?? jobDetail?.address
    ?? project.address
  const site = siteDisplay(siteName, siteAddress)
  const drawingNumber =
    parent?.drawingNumber ?? jobDetail?.drawingNumber ?? project.drawingNumber

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
        id: workItemsModel ? (originalWorkItem?.id ?? project.id) : project.id,
        status: originalStatus,
        designer: originalWorkItem?.designer ?? project.designer,
        requiredByDate: originalWorkItem?.requiredByDate ?? project.requiredByDate,
      },
      revLike,
    )
  }, [
    revisions,
    project.id,
    project.designer,
    project.requiredByDate,
    originalStatus,
    workItemsModel,
    originalWorkItem,
  ])

  const activeRevision = currentWork.type === "revision"
    ? revisions.find(r => r.id === currentWork.id) ?? revisions.find(r => r.isCurrent && r.letter) ?? null
    : null

  const revLabel = revisionBadgeLabel(
    currentWork.type === "revision"
      ? (activeRevision?.letter ?? project.currentRevisionLetter)
      : null,
  )

  const projectDetails = useMemo(() => {
    const description =
      parent?.description?.trim()
      || jobDetail?.notes?.trim()
      || (parent?.customTypeDescription ?? jobDetail?.customTypeDescription ?? null)
      || null
    const typeOfWorks = parent?.typeOfWorks ?? jobDetail?.typeOfWorks ?? project.typeOfWorks
    return {
      client,
      siteName: siteName?.trim() || site || null,
      siteAddress: siteAddress?.trim() || null,
      typeOfWorks,
      description: description
        || (typeOfWorks ? String(typeOfWorks) : null),
      requestedBy: parent?.requestedBy ?? jobDetail?.requestedBy ?? null,
      dateRequested:
        originalWorkItem?.requestedDate
        ?? jobDetail?.requestedDate
        ?? jobDetail?.dateCreated
        ?? parent?.createdAt
        ?? null,
      originalDesigner:
        originalWorkItem?.designer
        ?? (jobDetail && !jobDetail.revisionLetter ? jobDetail.designer : null)
        ?? null,
      originalFee:
        originalWorkItem?.quoteValue
        ?? (jobDetail && !jobDetail.parentJobId ? jobDetail.quoteValue : null)
        ?? null,
      quoteReference:
        originalWorkItem?.quoteReference
        ?? jobDetail?.quoteReference
        ?? null,
    }
  }, [
    parent,
    jobDetail,
    project.typeOfWorks,
    client,
    siteName,
    site,
    siteAddress,
    originalWorkItem,
  ])

  const originalQuote: QuoteCardItem | null = useMemo(() => {
    if (jobDetail?.currentQuote) return toQuoteCard(jobDetail.currentQuote)
    const linkedToParent = asSafeArray(quotesData?.quotes).filter(q => q.jobId === project.id)
    const preferred =
      linkedToParent.find(q => q.status === "ACCEPTED")
      ?? linkedToParent[0]
      ?? null
    if (preferred) return toQuoteCard(preferred)
    if (project.currentQuote) return toQuoteCard(project.currentQuote)
    return null
  }, [jobDetail, quotesData?.quotes, project.id, project.currentQuote])

  const revisionQuote: QuoteCardItem | null = useMemo(() => {
    if (!activeRevision?.legacyJobId) return null
    const hit = asSafeArray(quotesData?.quotes).find(q => q.jobId === activeRevision.legacyJobId)
    if (!hit) return null
    return toQuoteCard(hit, activeRevision.letter ? `Rev ${activeRevision.letter}` : "Revision")
  }, [quotesData?.quotes, activeRevision])

  const cat2Docs: Cat2Summary[] = useMemo(() => {
    return asSafeArray(docsData?.documents)
      .filter(d => /cat\s*ii|cat2|catii/i.test(`${d.originalFilename ?? ""} ${d.filename ?? ""}`))
      .map(d => {
        const name = `${d.originalFilename ?? ""} ${d.filename ?? ""}`
        const letterMatch = name.match(/rev\s*([a-z0-9]+)/i)
        const revisionLabel = d.revisionLetter
          ? `Rev ${d.revisionLetter}`
          : letterMatch?.[1]
            ? `Rev ${letterMatch[1].toUpperCase()}`
            : "Original"
        return {
          id: d.id,
          label: d.originalFilename || d.filename || "CAT II Check Sheet",
          createdAt: d.createdAt,
          revisionLabel,
        }
      })
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
  }, [docsData?.documents])

  const activeCat2Label =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : "Original"

  const activeCheck = useMemo(() => {
    if (currentWork.type === "revision") {
      const letter = (activeRevision?.letter ?? "").toUpperCase()
      return cat2Docs.find(d =>
        d.revisionLabel?.toUpperCase() === `REV ${letter}`
        || d.revisionLabel?.toUpperCase() === letter,
      ) ?? null
    }
    return cat2Docs.find(d => !d.revisionLabel || d.revisionLabel === "Original") ?? null
  }, [cat2Docs, currentWork.type, activeRevision])

  const previousCheck = useMemo(() => {
    if (activeCheck) return null
    return cat2Docs[0] ?? null
  }, [activeCheck, cat2Docs])

  const canExportCat2 = useMemo(() => {
    if (workItemsModel && parentDash) {
      return asSafeArray(parentDash.workItems).some(w => w.status === "ISSUED")
    }
    return (
      originalStatus === "ISSUED"
      || project.projectStatus === "ISSUED"
      || revisions.some(r => r.status === "ISSUED")
    )
  }, [workItemsModel, parentDash, originalStatus, project.projectStatus, revisions])

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
      toast(`CAT II Check created for ${activeCat2Label}`, "success")
      await mutateDocs()
      onStatusChanged?.()
    } catch {
      toast("CAT II export failed", "error")
    } finally {
      setCat2Busy(false)
    }
  }

  const handleUnlinkQuote = async (quote: QuoteCardItem) => {
    setUnlinkBusy(true)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/link-job`, {
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

  const handleCreateWorkItemRevision = async () => {
    const reason = wiRevReason.trim()
    if (reason.length < 3) {
      toast("Enter a reason for the revision (at least 3 characters)", "error")
      return
    }
    setWiRevSaving(true)
    try {
      const res = await fetch(`/api/parent-jobs/${project.id}/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: reason,
          notes: reason,
          billable: wiRevBillable,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast(err.error ?? "Failed to create revision", "error")
        return
      }
      toast("Revision created", "success")
      setWiRevOpen(false)
      setWiRevReason("")
      setWiRevBillable(true)
      await refreshAll()
    } catch {
      toast("Network error", "error")
    } finally {
      setWiRevSaving(false)
    }
  }

  const attachJobStub = { id: project.id, drawingNumber } as Job

  const isDrawer = presentation === "drawer"
  const actionBtn =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-bd bg-sr px-2.5 text-sm font-medium text-t1 transition-colors hover:bg-surface-low disabled:opacity-50"

  const drawingDesigner =
    activeRevision?.designer
    || (currentWork.type === "original" ? (originalWorkItem?.designer || project.designer) : project.designer)
    || ""

  const drawingDue =
    (currentWork.type === "revision" ? null : originalWorkItem?.requiredByDate)
    ?? project.requiredByDate

  const lastCompleted = useMemo(() => {
    const issued = revisions
      .filter(r => r.status === "ISSUED")
      .map(r => r.createdAt)
      .filter(Boolean)
    if (issued.length === 0) {
      return originalWorkItem?.completedAt
        ?? jobDetail?.dateCompleted
        ?? null
    }
    return issued.sort((a, b) => timeValue(b) - timeValue(a))[0] ?? null
  }, [revisions, originalWorkItem, jobDetail])

  const commercial = useMemo(() => {
    const originalFee = projectDetails.originalFee ?? null
    const revisionFees = revisions
      .filter(r => r.letter)
      .reduce((sum, r) => {
        if (!r.billable) return sum
        return sum + (typeof r.fee === "number" && Number.isFinite(r.fee) ? r.fee : 0)
      }, 0)
    const hasRevisionFee = revisions.some(r => r.letter && r.billable && r.fee != null)
    const revisionRevenue = hasRevisionFee ? revisionFees : (revisionFees > 0 ? revisionFees : null)
    const totalValue =
      originalFee != null || revisionRevenue != null
        ? (originalFee ?? 0) + (revisionRevenue ?? 0)
        : null
    const inv = parentDash?.invoiceSummary
    const outstanding = inv
      ? Math.max(0, (inv.quotedTotal || 0) - (inv.billedTotal || 0))
      : null
    const revisionCount =
      parentDash?.revisionCount
      ?? revisions.filter(r => r.letter).length
    const lastActivity =
      revisions.map(r => r.createdAt).sort((a, b) => timeValue(b) - timeValue(a))[0]
      ?? parent?.updatedAt
      ?? jobDetail?.updatedAt
      ?? null
    return {
      totalValue,
      outstanding,
      originalFee,
      revisionRevenue,
      revisionCount,
      lastActivity,
    }
  }, [projectDetails.originalFee, revisions, parentDash, parent?.updatedAt, jobDetail?.updatedAt])

  const statusChips = currentWork.type === "revision" ? (
    <>
      <StatusChip prefix="Project" status={originalStatus} />
      <StatusChip prefix="Curr. Rev" status={currentWork.status} />
    </>
  ) : currentWork.type === "original" ? (
    <StatusChip prefix="Original" status={currentWork.status} />
  ) : (
    <>
      <StatusChip prefix="Original" status={originalStatus} />
      <StatusChip prefix="Current" status={null} emptyLabel="No active work" />
    </>
  )

  const openAddRevision = () => {
    if (workItemsModel) {
      if (parentDash?.canAddRevision === false) {
        toast("Cannot add a revision until the current work is complete", "error")
        return
      }
      setWiRevOpen(true)
      return
    }
    setAddRevOpen(true)
  }

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-md border border-bd text-t3 transition-colors hover:bg-surface-low hover:text-t1",
            isDrawer ? "h-11 px-2.5 text-sm font-medium text-t1" : "p-1.5",
          )}
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
          {isDrawer ? <span>More</span> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={openAddRevision}>Add Revision</DropdownMenuItem>
        <DropdownMenuItem
          disabled={cat2Busy || !canExportCat2}
          onSelect={() => { void handleCat2() }}
        >
          CATII Check
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setAttachQuoteOpen(true)}>
          Attach Quote
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            window.location.href = `/quotes?new=1&jobId=${encodeURIComponent(project.id)}`
          }}
        >
          Create New Quote
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <aside
      className="jobs-inspector flex h-full min-h-0 w-full flex-col bg-sr"
      aria-label={`Inspector for ${drawingNumber}`}
    >
      <InspectorHeader
        drawingNumber={drawingNumber}
        revisionBadge={
          currentWork.type === "revision"
            ? (currentWork.revisionLabel ?? revLabel)
            : null
        }
        client={client}
        site={site}
        statusChips={statusChips}
        dense={isDrawer}
        leadingSlot={
          isDrawer && onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Back to Jobs"
              title="Back to Jobs"
              className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-bd text-t2 transition-colors hover:bg-surface-low hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac2"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null
        }
        collapseSlot={
          !isDrawer && onCollapse ? (
            <JobsInspectorCollapseButton
              onCollapse={onCollapse}
              variant={collapseVariant}
            />
          ) : null
        }
        moreSlot={moreMenu}
      >
        {isDrawer ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={cn(actionBtn, "h-11 w-full border-transparent bg-ac text-on-ac hover:bg-ach")}
              onClick={openAddRevision}
              disabled={!workItemsModel && !project.canAddRevision && !jobDetail}
            >
              <Plus className="h-4 w-4" />
              Add Revision
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={cn(actionBtn, "h-11")}
                onClick={() => void handleCat2()}
                disabled={cat2Busy || !canExportCat2}
                title={
                  canExportCat2
                    ? `Create CATII Check for ${activeCat2Label}`
                    : "CATII Check is available when original or a revision is complete"
                }
              >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="truncate">{cat2Busy ? "Creating…" : "CATII Check"}</span>
              </button>
              <button
                type="button"
                className={cn(actionBtn, "h-11")}
                onClick={() => setAttachQuoteOpen(true)}
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">Attach Quote</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className={cn(actionBtn, "border-transparent bg-ac text-on-ac hover:bg-ach")}
              onClick={openAddRevision}
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
                  ? `Create CATII Check for ${activeCat2Label}`
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
            {moreMenu}
          </div>
        )}
      </InspectorHeader>

      <div
        key={project.id}
        className={cn(
          "min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5",
          isDrawer && "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        )}
      >
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 skeleton rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <CurrentFocusSection
              currentWork={currentWork}
              revLabel={revLabel}
              designer={drawingDesigner}
              designers={designers}
              dueDate={drawingDue}
              nextAction={
                currentWork.type === "none"
                  ? "No active drawing work"
                  : deriveNextAction(currentWork.status, drawingDue)
              }
              lastCompleted={lastCompleted}
              patchUrl={currentWorkPatchUrl}
              onChanged={() => { void refreshAll() }}
            />

            <ProjectDetailsSection data={projectDetails} />

            {activeRevision && (
              <RevisionDetailsSection
                data={{
                  label: activeRevision.letter
                    ? `Rev ${activeRevision.letter}`
                    : (currentWork.revisionLabel ?? "Revision"),
                  reason: activeRevision.reason,
                  requestedBy: activeRevision.requestedBy ?? projectDetails.requestedBy,
                  requestedDate: activeRevision.requestedDate ?? activeRevision.createdAt,
                  billable: activeRevision.billable,
                  fee: activeRevision.fee,
                  quoteNumber: activeRevision.quoteNumber,
                }}
              />
            )}

            <CommercialSummary data={commercial} />

            <QuotationSummary
              originalQuote={originalQuote}
              revisionQuote={revisionQuote}
              unlinkBusy={unlinkBusy}
              onOpen={q => router.push(`/quotes?search=${encodeURIComponent(q.quoteNumber)}`)}
              onAttach={() => setAttachQuoteOpen(true)}
              onChange={() => setAttachQuoteOpen(true)}
              onUnlink={q => { void handleUnlinkQuote(q) }}
            />

            <CATIISummary
              activeLabel={activeCat2Label}
              activeCheck={activeCheck}
              previousCheck={previousCheck}
              busy={cat2Busy}
              canCreate={canExportCat2}
              onCreate={() => { void handleCat2() }}
              onOpen={id => {
                window.open(`/api/jobs/${project.id}/documents/${id}/preview`, "_blank")
              }}
            />

            <RevisionTimeline revisions={revisions} />
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

      <Dialog open={wiRevOpen} onOpenChange={open => { if (!open && !wiRevSaving) setWiRevOpen(false) }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Add Revision</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-t3" htmlFor="wi-rev-reason">
                  Reason for revision
                </label>
                <textarea
                  id="wi-rev-reason"
                  className="min-h-[96px] w-full rounded border border-bd bg-sr px-3 py-2 text-sm text-t1"
                  value={wiRevReason}
                  onChange={e => setWiRevReason(e.target.value)}
                  placeholder="Explain what needs to change…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-t2">
                <input
                  type="checkbox"
                  checked={wiRevBillable}
                  onChange={e => setWiRevBillable(e.target.checked)}
                />
                Chargeable revision
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={wiRevSaving} onClick={() => setWiRevOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              loading={wiRevSaving}
              onClick={() => { void handleCreateWorkItemRevision() }}
            >
              Create Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
