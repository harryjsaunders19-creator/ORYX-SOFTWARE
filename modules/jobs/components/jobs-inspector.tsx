"use client"

import { useEffect, useMemo, useState, lazy, Suspense } from "react"
import {
  Plus, ShieldCheck, ChevronLeft, FilePlus2, Paperclip,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { cn, defaultRequiredByDate } from "@/shared/utils/utils"
import type { Job, LinkedQuoteSummary, Quote } from "@/lib/types"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { JobsRegisterProject } from "./jobs-register-types"
import {
  revisionBadgeLabel,
  siteDisplay,
} from "./jobs-register-helpers"
import { downloadCat2CheckSheet } from "./cat2-check-sheet-export"
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
  StatusChip,
  CurrentRevisionSection,
  ProjectDetailsSection,
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

/** Detail secondary fetches must not briefly show another job's attachments/quotes. */
const SECONDARY_SWR = { keepPreviousData: false } as const

interface JobsInspectorProps {
  project: JobsRegisterProject
  workItemsModel: boolean
  designers: string[]
  onStatusChanged?: () => void
  onCollapse?: () => void
  collapseVariant?: "chevron" | "close"
  /** Mobile drawer uses stacked actions and a back control. */
  presentation?: "panel" | "drawer"
  /** Opens the full project workspace (Stitch Final “Edit”). */
  onEdit?: () => void
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
  parentId?: string
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
    requiredByDate?: string | null
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
  onEdit,
}: JobsInspectorProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [addRevOpen, setAddRevOpen] = useState(false)
  const [wiRevOpen, setWiRevOpen] = useState(false)
  const [wiRevReason, setWiRevReason] = useState("")
  const [wiRevBillable, setWiRevBillable] = useState(true)
  const [wiRevCost, setWiRevCost] = useState("")
  const [wiRevDue, setWiRevDue] = useState(defaultRequiredByDate())
  const [wiRevSaving, setWiRevSaving] = useState(false)
  const [attachQuoteOpen, setAttachQuoteOpen] = useState(false)
  const [cat2Busy, setCat2Busy] = useState(false)
  // Defer documents/quotes one frame so the panel paints list data first.
  const [secondaryReady, setSecondaryReady] = useState(false)

  useEffect(() => {
    setSecondaryReady(false)
    const id = requestAnimationFrame(() => setSecondaryReady(true))
    return () => cancelAnimationFrame(id)
  }, [project.id])

  const parentKey = workItemsModel ? `/api/parent-jobs/${project.id}` : null
  const jobKey = !workItemsModel ? `/api/jobs/${project.id}?include=parent,current` : null
  const revisionsKey = !workItemsModel ? `/api/jobs/${project.id}/revisions` : null
  const docsKey = secondaryReady ? `/api/jobs/${project.id}/documents?limit=40` : null
  const quotesKey = secondaryReady
    ? `/api/quotes?search=${encodeURIComponent(project.drawingNumber)}&page=1&limit=25`
    : null

  const { data: parentDashRaw, isLoading: parentLoading, mutate: mutateParent } =
    useApi<ParentJobDashboard>(parentKey)
  const { data: jobDetailRaw, isLoading: jobLoading, mutate: mutateJob } =
    useApi<Job>(jobKey)
  const { data: revisionsDataRaw, mutate: mutateRevisions } =
    useApi<RevisionsResponse>(revisionsKey)
  const { data: docsData, mutate: mutateDocs } = useApi<DocumentsResponse>(docsKey, SECONDARY_SWR)
  const { data: quotesData, mutate: mutateQuotes } = useApi<QuotesListResponse>(quotesKey, SECONDARY_SWR)

  // Ignore keepPreviousData from a different job when switching selection.
  const parentDash =
    parentDashRaw?.parent?.id === project.id ? parentDashRaw : undefined
  const jobDetail =
    jobDetailRaw && jobDetailRaw.id === project.id ? jobDetailRaw : undefined
  const revisionsData =
    revisionsDataRaw
    && (!revisionsDataRaw.parentId || revisionsDataRaw.parentId === project.id)
      ? revisionsDataRaw
      : undefined

  const secondaryLoading = Boolean(secondaryReady && !docsData)
  const revisionsLoading = !workItemsModel && !revisionsData && Boolean(jobLoading)
  const timelineLoading = workItemsModel
    ? Boolean(parentLoading && !parentDash)
    : revisionsLoading

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
            requiredByDate: wi.requiredByDate ?? null,
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
        requiredByDate: r.requiredByDate ?? null,
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
        requiredByDate: r.requiredByDate ?? null,
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

  const descriptionOfWorks = useMemo(() => {
    const typeOfWorks = parent?.typeOfWorks ?? jobDetail?.typeOfWorks ?? project.typeOfWorks
    const description =
      parent?.description?.trim()
      || jobDetail?.notes?.trim()
      || (parent?.customTypeDescription ?? jobDetail?.customTypeDescription ?? null)
      || null
    return description || (typeOfWorks ? String(typeOfWorks) : null)
  }, [parent, jobDetail, project.typeOfWorks])

  const projectDetails = useMemo(() => {
    const projectDesigner =
      originalWorkItem?.designer
      || jobDetail?.designer
      || project.designer
      || null
    return {
      client,
      siteId: null,
      siteName: siteName?.trim() || site || null,
      siteAddress: siteAddress?.trim() || null,
      descriptionOfWorks,
      requestedBy: parent?.requestedBy ?? jobDetail?.requestedBy ?? null,
      dateRequested:
        originalWorkItem?.requestedDate
        ?? jobDetail?.requestedDate
        ?? jobDetail?.dateCreated
        ?? parent?.createdAt
        ?? null,
      designDue: null,
      designer: projectDesigner?.trim() || null,
      checker: null as string | null,
      otherJobsAtSiteCount: 0,
    }
  }, [
    parent,
    jobDetail,
    project.designer,
    client,
    siteName,
    site,
    siteAddress,
    descriptionOfWorks,
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

  const handleCreateWorkItemRevision = async () => {
    const reason = wiRevReason.trim()
    if (reason.length < 3) {
      toast("Enter a reason for the revision (at least 3 characters)", "error")
      return
    }
    if (!wiRevDue.trim()) {
      toast("Enter a target due date", "error")
      return
    }
    let quoteValue: number | null = null
    if (wiRevBillable) {
      const parsed = parseFloat(wiRevCost)
      if (wiRevCost.trim() && !Number.isNaN(parsed)) {
        quoteValue = Math.round(parsed * 100) / 100
      }
    } else {
      quoteValue = 0
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
          quoteValue,
          requiredByDate: wiRevDue,
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
      setWiRevCost("")
      setWiRevDue(defaultRequiredByDate())
      await refreshAll()
    } catch {
      toast("Network error", "error")
    } finally {
      setWiRevSaving(false)
    }
  }

  const attachJobStub = { id: project.id, drawingNumber } as Job

  const isDrawer = presentation === "drawer"

  const drawingDesigner =
    activeRevision?.designer
    || (currentWork.type === "original" ? (originalWorkItem?.designer || project.designer) : project.designer)
    || ""

  const latestIssuedRevision = useMemo(() => {
    return revisions
      .filter(r => r.status === "ISSUED")
      .slice()
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))[0] ?? null
  }, [revisions])
  const lastCompleted = latestIssuedRevision?.createdAt
    ?? originalWorkItem?.completedAt
    ?? jobDetail?.dateCompleted
    ?? null
  const lastCompletedLabel = latestIssuedRevision
    ? (latestIssuedRevision.letter ? `Rev ${latestIssuedRevision.letter}` : "Original")
    : (originalWorkItem?.completedAt || jobDetail?.dateCompleted ? "Original" : null)

  const primaryQuote = revisionQuote ?? originalQuote

  const currentRevisionProps = {
    currentWork,
    revLabel,
    designer: drawingDesigner,
    designers,
    lastCompleted,
    lastCompletedLabel,
    descriptionOfWorks,
    revisionReason: activeRevision?.reason ?? null,
    revisionDate:
      activeRevision?.createdAt
      ?? originalWorkItem?.dateCreated
      ?? jobDetail?.dateCreated
      ?? parent?.createdAt
      ?? null,
    requiredByDate:
      activeRevision?.requiredByDate
      ?? currentWork.dueDate
      ?? null,
    patchUrl: currentWorkPatchUrl,
    onChanged: () => { void refreshAll() },
  }

  const openQuoteAction = () => {
    if (primaryQuote) {
      router.push(`/quotes?search=${encodeURIComponent(primaryQuote.quoteNumber)}`)
      return
    }
    setAttachQuoteOpen(true)
  }

  const summaryRevision =
    currentWork.type === "revision"
      ? (currentWork.revisionLabel ?? revLabel)
      : currentWork.type === "original"
        ? "Original"
        : "Complete"

  const statusChips = currentWork.type === "revision" ? (
    <>
      <StatusChip status={currentWork.status} tone="primary" />
      <StatusChip prefix="Project" status={originalStatus} tone="secondary" />
    </>
  ) : currentWork.type === "original" ? (
    <StatusChip status={currentWork.status} tone="primary" />
  ) : (
    <StatusChip prefix="Project" status={originalStatus} tone="secondary" />
  )

  const openAddRevision = () => {
    if (workItemsModel) {
      if (parentDash?.canAddRevision === false) {
        toast("Cannot add a revision until the current work is complete", "error")
        return
      }
      setWiRevDue(defaultRequiredByDate())
      setWiRevCost("")
      setWiRevOpen(true)
      return
    }
    setAddRevOpen(true)
  }

  const openCreateQuote = () => {
    router.push("/quotes")
  }

  const typeOfWorksLabel =
    parent?.typeOfWorks
    ?? jobDetail?.typeOfWorks
    ?? project.typeOfWorks
    ?? null

  return (
    <aside
      className={cn(
        "jobs-inspector flex min-h-0 w-full flex-col bg-jobs-panel",
        isDrawer ? "mobile-job-detail__body h-auto min-h-0 flex-1" : "h-full",
      )}
      aria-label={`Inspector for ${drawingNumber}`}
    >
      <div className={cn("shrink-0", isDrawer ? "mobile-job-detail__header border-b border-jobs-panel-bd" : "")}>
        <div
          className={cn(
            "flex items-start justify-between gap-3",
            isDrawer ? "px-6 pt-6 pb-5" : "px-7 pt-7 pb-6",
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            {isDrawer && onCollapse ? (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="Back to Jobs"
                title="Back to Jobs"
                className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-jobs-panel-bd text-t2 transition-colors duration-150 hover:bg-jobs-panel-hover hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ac2"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
            <div className="min-w-0">
              <h2 className="type-section-heading type-drawing-number text-t1 tabular-nums">
                {drawingNumber}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-t3">
                <span className="font-semibold text-t2 tabular-nums">
                  {summaryRevision}
                </span>
                <span className="text-jobs-panel-divider" aria-hidden>·</span>
                <span className="font-medium">
                  {drawingDesigner?.trim() || "Unassigned"}
                </span>
                {typeOfWorksLabel ? (
                  <>
                    <span className="text-jobs-panel-divider" aria-hidden>·</span>
                    <span className="font-medium">{typeOfWorksLabel}</span>
                  </>
                ) : null}
              </div>
              <p className="mt-2 text-[12px] font-medium text-t3">
                {[client, site].filter(Boolean).join(" · ") || "—"}
              </p>
              {isDrawer ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">{statusChips}</div>
              ) : null}
            </div>
          </div>
          {!isDrawer && onCollapse ? (
            <JobsInspectorCollapseButton
              onCollapse={onCollapse}
              variant={collapseVariant}
            />
          ) : null}
        </div>
        {!isDrawer ? (
          <div className="mx-7 border-t border-jobs-panel-divider" aria-hidden />
        ) : null}
      </div>

      <div
        key={project.id}
        className={cn(
          "mobile-job-detail__content min-h-0 flex-1 space-y-7 overflow-x-hidden overflow-y-auto overscroll-contain",
          "[-webkit-overflow-scrolling:touch]",
          isDrawer
            ? "px-6 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            : "px-7 py-6",
        )}
      >
        <section aria-label="Actions" className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-t1 px-3 text-sm font-semibold text-sr transition-transform duration-150 active:scale-[0.98] disabled:opacity-40"
            onClick={openAddRevision}
            disabled={!workItemsModel && !project.canAddRevision && !jobDetail}
          >
            <Plus className="h-4 w-4 shrink-0" />
            Add Revision
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-jobs-panel-btn-bd bg-transparent px-3 text-sm font-semibold text-t1 transition-colors duration-150 hover:bg-jobs-panel-hover"
            onClick={primaryQuote ? openQuoteAction : openCreateQuote}
          >
            <FilePlus2 className="h-4 w-4 shrink-0" />
            {primaryQuote ? "View Quote" : "Create Quote"}
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-jobs-panel-btn-bd bg-transparent px-3 text-sm font-semibold text-t1 transition-colors duration-150 hover:bg-jobs-panel-hover"
            onClick={() => setAttachQuoteOpen(true)}
          >
            <Paperclip className="h-4 w-4 shrink-0" />
            Attach Existing Quote
          </button>
          <button
            type="button"
            className={cn(
              "col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-jobs-panel-btn-bd bg-transparent px-3 text-sm font-semibold text-t1 transition-colors duration-150 hover:bg-jobs-panel-hover",
              (cat2Busy || !canExportCat2) && "opacity-40 cursor-not-allowed",
            )}
            onClick={() => {
              if (!cat2Busy && canExportCat2) void handleCat2()
            }}
            aria-disabled={cat2Busy || !canExportCat2}
            title={
              canExportCat2
                ? `Create CATII Check for ${activeCat2Label}`
                : "CATII Check is available when original or a revision is complete"
            }
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {cat2Busy ? "Creating…" : "CAT II Check"}
          </button>
          {!canExportCat2 && (
            <span className="sr-only" role="status">
              CATII Check is available when original or a revision is complete
            </span>
          )}
        </section>

        <div className="border-t border-jobs-panel-divider" aria-hidden />

        <ProjectDetailsSection data={projectDetails} jobKey={project.id} />

        <div className="border-t border-jobs-panel-divider" aria-hidden />

        {timelineLoading && revisions.length === 0 ? (
          <div className="space-y-5" aria-busy="true">
            <div className="h-14 skeleton rounded-lg" />
            <div className="h-14 skeleton rounded-lg" />
            <CurrentRevisionSection {...currentRevisionProps} />
          </div>
        ) : (
          <RevisionTimeline revisions={revisions} jobKey={project.id}>
            <CurrentRevisionSection {...currentRevisionProps} />
          </RevisionTimeline>
        )}

        <div className="border-t border-jobs-panel-divider" aria-hidden />

        {secondaryLoading && !activeCheck && !previousCheck ? (
          <div className="h-16 skeleton rounded-lg" aria-hidden />
        ) : (
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
        )}
      </div>

      {!isDrawer ? (
        <div className="flex shrink-0 gap-3 border-t border-jobs-panel-divider bg-jobs-panel px-7 py-5">
          <button
            type="button"
            className="flex-1 rounded-xl border border-jobs-panel-btn-bd bg-transparent py-2.5 text-sm font-semibold text-t1 transition-colors duration-150 hover:bg-jobs-panel-hover"
            onClick={() => onEdit?.() ?? router.push(`/jobs/${project.id}`)}
          >
            Edit
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border border-jobs-panel-btn-bd bg-transparent py-2.5 text-sm font-semibold text-t1 transition-colors duration-150 hover:bg-jobs-panel-hover"
            // TODO: this navigates to the job page rather than performing a cancel action
            onClick={() => router.push(`/jobs/${project.id}`)}
            title="Open project page to cancel"
          >
            Open to Cancel
          </button>
        </div>
      ) : null}

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
                  Amendment Reason
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
                Billable?
              </label>
              {wiRevBillable ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-t3" htmlFor="wi-rev-cost">
                    Revision Cost
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-t3">£</span>
                    <input
                      id="wi-rev-cost"
                      className="w-full rounded border border-bd bg-sr py-2 pl-7 pr-3 text-sm text-t1"
                      value={wiRevCost}
                      onChange={e => setWiRevCost(e.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ) : null}
              <div>
                <label className="mb-1 block text-xs font-medium text-t3" htmlFor="wi-rev-due">
                  Target Due Date
                </label>
                <input
                  id="wi-rev-due"
                  type="date"
                  className="w-full rounded border border-bd bg-sr px-3 py-2 text-sm text-t1"
                  value={wiRevDue}
                  onChange={e => setWiRevDue(e.target.value)}
                />
              </div>
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
