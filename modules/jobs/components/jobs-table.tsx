"use client"
import { useState, useEffect, useCallback, memo, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format }    from "date-fns"
import {
  Search, Plus, Download, Upload, SlidersHorizontal,
  Pencil, Trash2, ChevronLeft, ChevronRight,
  X, FolderOpen, ArrowUp, ArrowDown, ArrowUpDown, GitBranch, AlertTriangle, Clock,
  MoreHorizontal, Building2, FileText, UserCircle2, PenTool, ClipboardCheck,
} from "lucide-react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/shared/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { JOB_ROW_BG, JOB_ROW_BORDER } from "@/components/status-badge"
import { WorkItemTypeBadge } from "@/components/work-item-type-badge"
import { TypeOfWorksBadge } from "@/components/type-of-works-badge"
import dynamic from "next/dynamic"
import { useMediaQuery } from "@/shared/hooks/use-media-query"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import { InlineStatusSelect, InlineDesignerSelect } from "@/components/inline-edit-selects"

// Lazy-load heavy dialog components — only downloaded when the user first
// opens a create/edit dialog, not on every initial page load.
const JobForm            = dynamic(() => import("./job-form").then(m => m.JobForm), { ssr: false })
const AssignDesignerModal = dynamic(() => import("@/components/assign-designer-modal").then(m => m.AssignDesignerModal), { ssr: false })
import { useToast }      from "@/shared/ui/toast"
import { useUser }       from "@/shared/providers/user-context"
import { JOB_STATUSES, WORK_ITEM_TYPES, WORKS_TYPES, getJobStatus } from "@/lib/constants"
import { cn, formatGBP, getJobDeadlineInfo, parseLocalDate, totalJobCommercialValue } from "@/shared/utils/utils"
import { ToolbarCard } from "@/shared/layouts/page-layout"
import { notifyRevisionsChanged } from "@/lib/revision-events"
import { revisionParentId } from "@/lib/revision-chain"
import type { Job, JobFormData, JobsResponse, SortField, SortDir } from "@/lib/types"

const LIMIT = 25

// Column visibility by breakpoint — mirrors the required mobile priority
// order (Drawing No. → Address → Completion Status → Type of Works →
// Client). Drawing No./Address/Completion Status have no hidden-* class
// below, since they must always be visible. Requested By, Quotation, and
// Designer are the least critical on a narrow screen, so they appear latest.
const COL_TYPE_OF_WORKS = "hidden sm:table-cell"
const COL_CLIENT        = "hidden sm:table-cell"
const COL_REQUESTED_BY  = "hidden md:table-cell"
const COL_QUOTATION     = "hidden lg:table-cell"
const COL_DESIGNER      = "hidden lg:table-cell"

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-bd">
          {[110, 200, 130, 130, 120, 90, 130, 110].map((w, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="skeleton h-4" style={{ width: w }} />
            </td>
          ))}
          <td className="px-4 py-3.5 w-16" />
        </tr>
      ))}
    </>
  )
}

function EmptyState({ hasFilters, onCreate, onClear }: {
  hasFilters: boolean; onCreate: () => void; onClear: () => void
}) {
  return (
    <tr>
      <td colSpan={9} className="py-16 text-center">
        <div className="inline-flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded border border-bd flex items-center justify-center bg-pg">
            <FolderOpen className="h-5 w-5 text-t4" />
          </div>
          <div>
            <p className="text-sm font-medium text-t1">{hasFilters ? "No jobs match" : "No jobs yet"}</p>
            <p className="text-xs text-t3 mt-0.5">
              {hasFilters ? "Try clearing your filters" : "Create your first job to get started"}
            </p>
          </div>
          {hasFilters
            ? <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>
            : <Button variant="primary" size="sm" onClick={onCreate}><Plus className="h-3.5 w-3.5" />New job</Button>
          }
        </div>
      </td>
    </tr>
  )
}

function SortTh({ field, label, current, dir, onSort, className }: {
  field: SortField; label: string; current: SortField; dir: SortDir
  onSort: (f: SortField) => void; className?: string
}) {
  const active = current === field
  return (
    <th
      onClick={() => onSort(field)}
      className={cn(
        "px-4 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === "asc" ? <ArrowUp className="h-3 w-3 text-t2" /> : <ArrowDown className="h-3 w-3 text-t2" />
          : <ArrowUpDown className="h-3 w-3 text-t4" />}
      </span>
    </th>
  )
}

const JobMobileCard = memo(function JobMobileCard({
  job,
  isOnHold,
  onOpen,
  onStatusChange,
}: {
  job: Job
  isOnHold: boolean
  // Perf: stable callbacks from parent so memo skips re-render when filters change.
  onOpen: (jobId: string) => void
  onStatusChange: (job: Job, status: string) => void
}) {
  const dl = getJobDeadlineInfo(job)
  const showDeadline = dl.severity !== "none"
  const total = totalJobCommercialValue(job)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job.id)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpen(job.id) }}
      className={cn(
        "rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2.5 cursor-pointer active:scale-[0.99] transition-transform",
        JOB_ROW_BG[job.status] ?? "",
        JOB_ROW_BORDER[job.status] ?? "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {job.revisionLetter && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ac-bg text-ac shrink-0">
                Rev {job.revisionLetter}
              </span>
            )}
            <span className="font-mono text-xs font-bold text-ac">{job.drawingNumber}</span>
            {job.itemType && job.itemType !== "DESIGN" && job.itemType !== "REVISION" && (
              <WorkItemTypeBadge itemType={job.itemType} size="sm" />
            )}
          </div>
          <p className="text-sm font-medium text-t1 mt-1 line-clamp-2">{job.address}</p>
          <p className="text-xs text-t3 mt-0.5 truncate">{job.clientCompany}</p>
        </div>
        {isOnHold && (
          <AlertTriangle className="h-4 w-4 text-dn shrink-0" aria-label="Client on hold" />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
        <InlineStatusSelect status={job.status} onChange={value => onStatusChange(job, value)} size="lg" />
        {showDeadline && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border",
            dl.severity === "overdue" ? "bg-dn-bg text-dn-tx border-dn-bd"
              : dl.severity === "today" ? "bg-wn-bg text-wn-tx border-wn-bd"
              : "bg-wn-bg/60 text-wn-tx border-wn-bd/60",
          )}>
            <Clock className="h-3 w-3 shrink-0" />
            {dl.label}
          </span>
        )}
      </div>

      {(total != null || job.designer) && (
        <div className="flex items-center justify-between gap-2 text-xs text-t3 pt-0.5 border-t border-bd/60">
          {total != null && (
            <span className="tabular-nums font-medium text-t2">{formatGBP(total)}</span>
          )}
          {job.designer && (
            <span className="truncate">{job.designer}</span>
          )}
        </div>
      )}
    </div>
  )
})

type JobWithRevision = Job & { canAddRevision?: boolean }

interface JobTableRowProps {
  job:                  JobWithRevision
  isOnHold:             boolean
  designers:            string[]
  isAdmin:              boolean
  creatingRevisionFor:  string | null
  onPatchField:         (job: JobWithRevision, field: "status" | "designer", value: string) => void
  onEdit:               (job: JobWithRevision) => void
  onDelete:             (job: JobWithRevision) => void
  onAssign:             (job: JobWithRevision) => void
  onQuickRevision:      (job: JobWithRevision) => void
  onNavigate:           (path: string) => void
}

// Memoized desktop table row. Re-renders only when the job data itself changes
// (e.g. after an inline status/designer edit), not when parent state like
// search filters or page number changes.
const JobTableRow = memo(
  function JobTableRow({
    job, isOnHold, designers, isAdmin, creatingRevisionFor,
    onPatchField, onEdit, onDelete, onAssign, onQuickRevision, onNavigate,
  }: JobTableRowProps) {
    const dl = getJobDeadlineInfo(job)
    const showDeadlineFlag = dl.severity === "overdue" || dl.severity === "today" || dl.severity === "soon"

    return (
      <tr
        onClick={() => onNavigate(`/jobs/${job.id}`)}
        className={cn(
          "border-b border-bd last:border-0 cursor-pointer group",
          JOB_ROW_BG[job.status] ?? "",
          JOB_ROW_BORDER[job.status] ?? "",
          "hover:brightness-[0.98]",
        )}
      >
        <td className="px-4 py-3.5 whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            {job.revisionLetter && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ac-bg text-ac shrink-0">
                Rev {job.revisionLetter}
              </span>
            )}
            <span className="font-mono text-[11px] font-semibold text-ac">{job.drawingNumber}</span>
            {job.itemType && job.itemType !== "DESIGN" && job.itemType !== "REVISION" && (
              <WorkItemTypeBadge itemType={job.itemType} size="sm" />
            )}
          </span>
        </td>

        <td className="px-4 py-3.5 max-w-[220px]">
          <p className="text-sm font-medium text-t1 truncate" title={job.address}>{job.address}</p>
        </td>

        <td className={cn("px-4 py-3.5 whitespace-nowrap", COL_TYPE_OF_WORKS)}>
          <TypeOfWorksBadge typeOfWorks={job.typeOfWorks} customTypeDescription={job.customTypeDescription} size="sm" />
        </td>

        <td className={cn("px-4 py-3.5 max-w-[170px]", COL_CLIENT)}>
          <div className="flex items-center gap-1.5 flex-wrap">
            {isOnHold && (
              <span title="Client on hold"><AlertTriangle className="h-3 w-3 text-dn shrink-0" /></span>
            )}
            <p className="text-xs font-medium text-t1 truncate">{job.clientCompany}</p>
            {isOnHold && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-dn-bg text-dn-tx whitespace-nowrap">
                On Hold
              </span>
            )}
          </div>
        </td>

        <td className={cn("px-4 py-3.5 max-w-[150px]", COL_REQUESTED_BY)}>
          <p className="text-xs text-t3 truncate flex items-center gap-1.5">
            <UserCircle2 className="h-3 w-3 text-t4 shrink-0" />
            {job.requestedBy || <span className="italic text-t4">—</span>}
          </p>
        </td>

        <td className={cn("px-4 py-3.5 whitespace-nowrap text-right", COL_QUOTATION)}>
          <p className="text-xs tabular-nums font-medium text-t2">
            {totalJobCommercialValue(job) != null
              ? formatGBP(totalJobCommercialValue(job))
              : job.quoteValue != null
                ? formatGBP(job.quoteValue)
                : <span className="text-t4">—</span>}
          </p>
          {(job.variationFees != null || job.additionalCharges != null) && job.quoteValue != null && (
            <p className="text-[10px] text-t4 tabular-nums">incl. extras</p>
          )}
          {job.quoteReference && (
            <p className="text-[10px] font-mono text-t4 tabular-nums">{job.quoteReference}</p>
          )}
        </td>

        <td className="px-4 py-3.5 whitespace-nowrap min-w-[148px]" onClick={e => e.stopPropagation()}>
          <InlineStatusSelect
            status={job.status}
            onChange={value => onPatchField(job, "status", value)}
            size="lg"
          />
          {showDeadlineFlag && (
            <p className={cn(
              "mt-1 inline-flex items-center gap-1 text-[10px] font-medium",
              dl.severity === "overdue" ? "text-dn-tx" : "text-wn-tx",
            )}>
              {dl.severity === "overdue" && <Clock className="h-2.5 w-2.5 shrink-0" />}
              {dl.label}
            </p>
          )}
        </td>

        <td className={cn("px-4 py-3.5 whitespace-nowrap", COL_DESIGNER)} onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            <PenTool className="h-3 w-3 text-t4 shrink-0" />
            <InlineDesignerSelect
              designer={job.designer}
              designers={designers}
              onChange={value => onPatchField(job, "designer", value)}
              onRequestNew={() => onAssign(job)}
            />
          </div>
        </td>

        <td className="px-3 py-3.5 whitespace-nowrap" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            {job.canAddRevision && (
              <Button
                variant="outline"
                size="sm"
                loading={creatingRevisionFor === job.id}
                onClick={() => onQuickRevision(job)}
                title="Create the next revision in this chain"
                className="shrink-0"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Add revision
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "h-7 w-7 rounded flex items-center justify-center text-t4 hover:text-t2 hover:bg-pg",
                    "invisible group-hover:visible data-[state=open]:visible data-[state=open]:bg-pg data-[state=open]:text-t2",
                  )}
                  title="Quick actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onEdit(job)}>
                  <Pencil className="h-3.5 w-3.5 text-t4" /> Edit job
                </DropdownMenuItem>
                {job.clientId && (
                  <DropdownMenuItem onSelect={() => onNavigate(`/clients/${job.clientId}`)}>
                    <Building2 className="h-3.5 w-3.5 text-t4" /> View client
                  </DropdownMenuItem>
                )}
                {job.quoteReference && (
                  <DropdownMenuItem onSelect={() => onNavigate(`/quotes?search=${encodeURIComponent(job.quoteReference!)}`)}>
                    <FileText className="h-3.5 w-3.5 text-t4" /> Open quote
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger onSelect={() => onDelete(job)}>
                      <Trash2 className="h-3.5 w-3.5" /> Cancel job
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>
    )
  },
  // Custom comparator: skip re-render unless the job data or display-critical
  // props change. Callbacks are intentionally excluded — they can be stale
  // without causing data corruption because patchJobField uses functional state
  // updates and refresh is idempotent.
  (prev, next) =>
    prev.job === next.job &&
    prev.isOnHold === next.isOnHold &&
    prev.creatingRevisionFor === next.creatingRevisionFor &&
    prev.designers === next.designers &&
    prev.isAdmin === next.isAdmin,
)

function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full border border-ac/30 bg-ac-bg text-[11px] font-medium text-ac">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-ac/15 text-ac"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function JobsTable({ mode = "default" }: { mode?: "default" | "checking" }) {
  const isCheckingQueue = mode === "checking"
  const router       = useRouter()
  const { toast }    = useToast()
  const { isAdmin } = useUser()

  const [holdClientIds, setHoldClientIds] = useState<Set<string>>(new Set())
  const [designers,    setDesigners]    = useState<string[]>([])
  const isMobile       = useMediaQuery("(max-width: 767px)")
  const searchParams = useSearchParams()
  const [search,       setSearch]       = useState(() => searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 280)
  const [statusFilter,  setStatusFilter]  = useState(() =>
    isCheckingQueue ? "CHECKING" : (searchParams.get("status")  ?? "ALL"))
  const [onlyOriginals, setOnlyOriginals] = useState(() => searchParams.get("onlyOriginals") === "true")
  const [onlyRevisions, setOnlyRevisions] = useState(() => searchParams.get("onlyRevisions") === "true")
  const [itemTypeFilter, setItemTypeFilter] = useState(() => searchParams.get("itemType") ?? "ALL")
  const [typeOfWorksFilter, setTypeOfWorksFilter] = useState(() => searchParams.get("typeOfWorks") ?? "ALL")
  const [deadlineFilter,  setDeadlineFilter]  = useState(() => searchParams.get("deadline") ?? "ALL")
  const _initUnassigned = searchParams.get("unassigned") === "true"
  const [page,         setPage]         = useState(1)
  const [sortBy,       setSortBy]       = useState<SortField>("drawingNumber")
  const [sortDir,      setSortDir]      = useState<SortDir>("asc")
  const [showFilters,  setShowFilters]  = useState(false)
  const [createOpen,   setCreateOpen]   = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [editJob,      setEditJob]      = useState<Job | null>(null)
  const [editSaving,   setEditSaving]   = useState(false)
  const [deleteJob,    setDeleteJob]    = useState<Job | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [deleting,     setDeleting]     = useState(false)
  const [assignJob,    setAssignJob]    = useState<Job | null>(null)
  const [creatingRevisionFor, setCreatingRevisionFor] = useState<string | null>(null)

  useEffect(() => { setPage(1) }, [debouncedSearch])

  const jobsApiKey = useMemo(() => {
    const qs = new URLSearchParams({
      page: String(page), limit: String(LIMIT),
      sortBy, sortDir,
      ...(debouncedSearch              && { search: debouncedSearch }),
      ...(statusFilter !== "ALL"        && { status: statusFilter }),
      ...(onlyOriginals && { onlyOriginals: "true" }),
      ...(onlyRevisions && { onlyRevisions: "true" }),
      ...(itemTypeFilter !== "ALL"      && { itemType: itemTypeFilter }),
      ...(typeOfWorksFilter !== "ALL"   && { typeOfWorks: typeOfWorksFilter }),
      ...(deadlineFilter === "overdue"   && { overdue: "true" }),
      ...(deadlineFilter === "today"     && { dueToday: "true" }),
      ...(deadlineFilter === "this_week" && { dueThisWeek: "true" }),
    })
    return `/api/jobs?${qs}`
  }, [page, debouncedSearch, statusFilter, itemTypeFilter, typeOfWorksFilter, deadlineFilter, sortBy, sortDir, onlyOriginals, onlyRevisions])

  const { data, error, isLoading, isValidating, mutate } = useApi<JobsResponse>(jobsApiKey)
  const { data: holdData } = useApi<{ holds: { clientId: string }[] }>("/api/hold-list")
  const { data: designersData } = useApi<{ designers: string[] }>("/api/jobs/designers")

  useEffect(() => { if (error) toast("Failed to load jobs", "error") }, [error, toast])
  useEffect(() => {
    if (holdData) setHoldClientIds(new Set(holdData.holds.map(h => h.clientId)))
  }, [holdData])
  useEffect(() => {
    if (designersData) setDesigners(designersData.designers)
  }, [designersData])

  const loading = isLoading && !data
  const refreshing = isValidating && !!data
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === "c") { e.preventDefault(); setCreateOpen(true) }
      if (e.key === "/") { e.preventDefault(); document.getElementById("jobs-search")?.focus() }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const handleSort = (field: SortField) => {
    const dir: SortDir = sortBy === field && sortDir === "desc" ? "asc" : "desc"
    setSortBy(field); setSortDir(dir); setPage(1)
  }

  const exitCheckingQueue = () => router.push("/jobs")

  const applyStatusFilter = (value: string) => {
    if (isCheckingQueue) {
      if (value === "CHECKING") return
      router.push(value === "ALL" ? "/jobs" : `/jobs?status=${value}`)
      return
    }
    setStatusFilter(value)
    setPage(1)
  }

  const clearStatusFilter = () => {
    if (isCheckingQueue) {
      exitCheckingQueue()
      return
    }
    applyStatusFilter("ALL")
  }

  const clearAllFilters = () => {
    if (isCheckingQueue) {
      exitCheckingQueue()
      return
    }
    setSearch("")
    setStatusFilter("ALL")
    setItemTypeFilter("ALL")
    setTypeOfWorksFilter("ALL")
    setDeadlineFilter("ALL")
    setOnlyOriginals(false)
    setOnlyRevisions(false)
    setPage(1)
  }

  const handleCreate = async (form: JobFormData) => {
    setCreateSaving(true)
    try {
      const { proceedDespiteHold, ...payload } = form
      const res = await fetch("/api/jobs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, proceedDespiteHold }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; onHold?: boolean; holdReason?: string }
        if (res.status === 422 && body.onHold) {
          toast(body.holdReason ?? body.error ?? "Client is on hold", "error")
        } else {
          toast(body.error ?? "Failed to create job", "error")
        }
        throw new Error()
      }
      const job = await res.json() as Job
      toast(`${job.drawingNumber} created`, "success")
      setCreateOpen(false); setPage(1)
      optimisticListPrepend(mutate, "jobs", job)
    } finally { setCreateSaving(false) }
  }

  const handleEdit = async (form: JobFormData) => {
    if (!editJob) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/jobs/${editJob.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      })
      if (!res.ok) { toast("Failed to save changes", "error"); throw new Error() }
      toast("Changes saved", "success")
      setEditJob(null); mutate()
    } finally { setEditSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteJob) return
    const reason = cancelReason.trim()
    if (reason.length < 3) {
      toast("Please enter a cancellation reason (at least 3 characters)", "error")
      return
    }
    setDeleting(true)
    try {
      const res = await fetch(`/api/jobs/${deleteJob.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to cancel job", "error")
        return
      }
      toast(`${deleteJob.drawingNumber} moved to Archive`, "info")
      setDeleteJob(null)
      setCancelReason("")
      setPage(1)
      optimisticListRemove(mutate, "jobs", deleteJob.id)
    } finally { setDeleting(false) }
  }

  const patchJobField = useCallback(async (job: Job, field: "status" | "designer", value: string) => {
    await mutate(
      current => current ? { ...current, jobs: current.jobs.map(j => j.id === job.id ? { ...j, [field]: value } : j) } : current,
      { revalidate: false },
    )
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        toast(field === "status" ? "Failed to change status" : "Failed to assign designer", "error")
        await mutate()
        return
      }
      const updated = await res.json() as Job
      await mutate(
        current => current ? { ...current, jobs: current.jobs.map(j => j.id === job.id ? updated : j) } : current,
        { revalidate: false },
      )
      if (field === "designer") {
        setDesigners(prev => value && !prev.includes(value) ? [...prev, value].sort() : prev)
      }
    } catch {
      toast("Network error", "error")
      await mutate()
    }
  }, [mutate, toast])

  // Perf: stable handlers so JobMobileCard memo is not busted by inline lambdas per row.
  const openJob = useCallback((jobId: string) => { router.push(`/jobs/${jobId}`) }, [router])
  const patchMobileStatus = useCallback((job: Job, status: string) => {
    void patchJobField(job, "status", status)
  }, [patchJobField])

  // One-click revision — no modal, no fields. Letter is auto-assigned server-side.
  const handleQuickRevision = useCallback(async (job: Job) => {
    setCreatingRevisionFor(job.id)
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to create revision", "error"); return
      }
      const revision = await res.json() as Job
      toast(`${revision.drawingNumber} created`, "success")
      notifyRevisionsChanged(revision.parentJobId ?? revisionParentId(job))
      mutate()
    } catch { toast("Network error", "error") }
    finally { setCreatingRevisionFor(null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleExport = async () => {
    const qs = new URLSearchParams({
      export: "true",
      ...(search                  && { search }),
      ...(statusFilter !== "ALL"  && { status: statusFilter }),
      ...(itemTypeFilter && itemTypeFilter !== "ALL" && { itemType: itemTypeFilter }),
      ...(typeOfWorksFilter && typeOfWorksFilter !== "ALL" && { typeOfWorks: typeOfWorksFilter }),
      ...(deadlineFilter === "overdue"   && { overdue: "true" }),
      ...(deadlineFilter === "today"     && { dueToday: "true" }),
      ...(deadlineFilter === "this_week" && { dueThisWeek: "true" }),
      ...(onlyOriginals && { onlyOriginals: "true" }),
      ...(onlyRevisions && { onlyRevisions: "true" }),
    })
    try {
      const { jobs, truncated, total } = await fetch(`/api/jobs?${qs}`).then(r => r.json()) as {
        jobs: Job[]
        truncated?: boolean
        total?: number
      }
      const headers = ["Drawing No.","Address","Type of Works","Custom Type Description","Client","Requested By","Item Type","Status","Designer","Quote Value","Quote Ref","Date Created","Date Completed","Originally Entered As","Notes"]
      const rows = jobs.map(j => [
        j.drawingNumber, j.address, j.typeOfWorks, j.customTypeDescription ?? "", j.clientCompany, j.requestedBy,
        j.itemType ?? "DESIGN", getJobStatus(j.status).label, j.designer,
        j.quoteValue != null ? j.quoteValue.toString() : "",
        j.quoteReference ?? "",
        format(new Date(j.dateCreated), "dd/MM/yyyy"),
        j.dateCompleted ? format(parseLocalDate(j.dateCompleted), "dd/MM/yyyy") : "",
        j.legacyTypeOfWorks ?? "",
        j.notes ?? "",
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))
      const csv = [headers.join(","), ...rows].join("\n")
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
      const a = document.createElement("a")
      a.href = url; a.download = `oryx-jobs-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click()
      URL.revokeObjectURL(url)
      toast(
        truncated && total != null
          ? `Exported ${jobs.length} of ${total} jobs (limit reached — narrow filters for a full export)`
          : `Exported ${jobs.length} job${jobs.length !== 1 ? "s" : ""}`,
        truncated ? "info" : "success",
      )
    } catch { toast("Export failed", "error") }
  }

  const hasFilters = !!search || (!isCheckingQueue && statusFilter !== "ALL") || itemTypeFilter !== "ALL" || typeOfWorksFilter !== "ALL" || deadlineFilter !== "ALL" || onlyOriginals || onlyRevisions
  const activeFilterCount = [
    isCheckingQueue || statusFilter !== "ALL",
    itemTypeFilter !== "ALL",
    typeOfWorksFilter !== "ALL",
    deadlineFilter !== "ALL",
    onlyOriginals,
    onlyRevisions,
  ].filter(Boolean).length
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0
  const sp = { current: sortBy, dir: sortDir, onSort: handleSort }

  return (
    <>
      {/* Toolbar */}
      <ToolbarCard>
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
          <Input
            id="jobs-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="pl-10 pr-8 h-10 rounded-full bg-pg border-none shadow-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-t4 hover:text-t2">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant={showFilters ? "secondary" : "outline"} size="sm"
          onClick={() => setShowFilters(v => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-ac text-on-ac rounded-full h-4 w-4 text-[10px] flex items-center justify-center font-bold shrink-0">{activeFilterCount}</span>
          )}
        </Button>

        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        )}

        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => router.push("/jobs/import")}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
        )}

        {isCheckingQueue ? (
          <Button variant="outline" size="sm" onClick={exitCheckingQueue}>
            <X className="h-3.5 w-3.5" />
            All jobs
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => router.push("/jobs/checking")}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            Checking queue
          </Button>
        )}

        <Button variant="primary" size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New job
        </Button>
      </ToolbarCard>

      {/* Active filters — always visible so status/deadline chips can be cleared without opening the panel */}
      {(isCheckingQueue || hasFilters || !!search) && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {(isCheckingQueue || statusFilter !== "ALL") && (
            <ActiveFilterChip
              label={getJobStatus(isCheckingQueue ? "CHECKING" : statusFilter).label}
              onRemove={clearStatusFilter}
            />
          )}
          {deadlineFilter === "overdue" && (
            <ActiveFilterChip label="Overdue" onRemove={() => { setDeadlineFilter("ALL"); setPage(1) }} />
          )}
          {deadlineFilter === "today" && (
            <ActiveFilterChip label="Due today" onRemove={() => { setDeadlineFilter("ALL"); setPage(1) }} />
          )}
          {deadlineFilter === "this_week" && (
            <ActiveFilterChip label="Due this week" onRemove={() => { setDeadlineFilter("ALL"); setPage(1) }} />
          )}
          {itemTypeFilter !== "ALL" && (
            <ActiveFilterChip
              label={WORK_ITEM_TYPES.find(t => t.value === itemTypeFilter)?.label ?? itemTypeFilter}
              onRemove={() => { setItemTypeFilter("ALL"); setPage(1) }}
            />
          )}
          {typeOfWorksFilter !== "ALL" && (
            <ActiveFilterChip label={typeOfWorksFilter} onRemove={() => { setTypeOfWorksFilter("ALL"); setPage(1) }} />
          )}
          {onlyOriginals && (
            <ActiveFilterChip label="Originals only" onRemove={() => { setOnlyOriginals(false); setPage(1) }} />
          )}
          {onlyRevisions && (
            <ActiveFilterChip label="Revisions only" onRemove={() => { setOnlyRevisions(false); setPage(1) }} />
          )}
          {search && (
            <ActiveFilterChip label={`Search: ${search}`} onRemove={() => setSearch("")} />
          )}
          {(hasFilters || !!search) && !isCheckingQueue && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-t3 hover:text-t2 underline underline-offset-2"
            >
              Clear all
            </button>
          )}
          {isCheckingQueue && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-t3 hover:text-t2 underline underline-offset-2"
            >
              View all jobs
            </button>
          )}
        </div>
      )}

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-sr border border-bd rounded-xl shadow-card flex-wrap">
          <span className="text-xs font-medium text-t2">Status</span>
          <div className="w-44">
            <Select value={statusFilter} onValueChange={applyStatusFilter}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {JOB_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Type of Works — a Select rather than pills, unlike item type below:
              18 controlled values would overwhelm a pill row at this width. */}
          <div className="h-4 w-px bg-bd" />
          <span className="text-xs font-medium text-t2">Type of Works</span>
          <div className="w-48">
            <Select value={typeOfWorksFilter} onValueChange={v => { setTypeOfWorksFilter(v); setPage(1) }}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types of works</SelectItem>
                {WORKS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Work item type */}
          <div className="h-4 w-px bg-bd" />
          <span className="text-xs font-medium text-t2">Type</span>
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => { setItemTypeFilter("ALL"); setPage(1) }}
              className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${itemTypeFilter === "ALL" ? "bg-ac text-on-ac" : "border border-bd text-t3 hover:text-t2"}`}>
              All
            </button>
            {WORK_ITEM_TYPES.map(t => (
              <button key={t.value} onClick={() => { setItemTypeFilter(t.value); setPage(1) }}
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${itemTypeFilter === t.value ? `${t.color}` : "border border-bd text-t3 hover:text-t2"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Deadline filter */}
          <div className="h-4 w-px bg-bd" />
          <span className="text-xs font-medium text-t2">Deadline</span>
          <div className="flex items-center gap-1">
            {[
              { v: "ALL",       l: "All" },
              { v: "overdue",   l: "Overdue",   cls: "text-dn-tx bg-dn-bg" },
              { v: "today",     l: "Due today",  cls: "text-wn-tx bg-wn-bg" },
              { v: "this_week", l: "This week",  cls: "text-wn-tx bg-wn-bg/60" },
            ].map(({ v, l, cls }) => (
              <button key={v} onClick={() => { setDeadlineFilter(v); setPage(1) }}
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                  deadlineFilter === v
                    ? (v === "ALL" ? "bg-ac text-on-ac" : (cls ?? "bg-ac text-on-ac"))
                    : "border border-bd text-t3 hover:text-t2"
                }`}>
                {l}
              </button>
            ))}
          </div>

          {(hasFilters || isCheckingQueue) && (
            <button onClick={clearAllFilters}
              className="text-xs text-t3 hover:text-t2 underline underline-offset-2">
              {isCheckingQueue ? "View all jobs" : "Clear all"}
            </button>
          )}
        </div>
      )}

      {isCheckingQueue && (
        <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border border-yl-bd bg-yl-bg text-sm text-yl-tx">
          <ClipboardCheck className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Jobs awaiting technical review. Mark <span className="font-semibold">Complete</span> when ready to issue,
            or send back to <span className="font-semibold">In Progress</span> for further design work.
          </p>
        </div>
      )}

      {/* Count */}
      {data && !loading && (
        <p className="text-xs text-t3 mb-3">
          <span className="font-semibold text-t2">{data.total.toLocaleString()}</span>
          {" "}job{data.total !== 1 ? "s" : ""}{hasFilters && " matching filters"}
        </p>
      )}

      {/* Mobile field view — compact cards for site / phone use */}
      {isMobile && (
      <div className="space-y-2.5 mb-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-bd bg-sr skeleton" />
          ))
        ) : !data || data.jobs.length === 0 ? (
          <div className="rounded-xl border border-bd bg-sr py-12 text-center">
            <p className="text-sm font-medium text-t1">{hasFilters ? "No jobs match" : "No jobs yet"}</p>
          </div>
        ) : (
          <div className={cn("space-y-2.5 transition-opacity", refreshing && "opacity-60")}>
          {data.jobs.map(job => (
            <JobMobileCard
              key={job.id}
              job={job}
              isOnHold={!!(job.clientId && holdClientIds.has(job.clientId))}
              onOpen={openJob}
              onStatusChange={patchMobileStatus}
            />
          ))}
          </div>
        )}
      </div>
      )}

      {/* Desktop table */}
      {!isMobile && (
      <div className={cn("bg-sr border border-bd rounded-xl shadow-card overflow-hidden transition-opacity", refreshing && "opacity-60")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-low border-b border-bd">
                <SortTh field="drawingNumber" label="Drawing No." {...sp} />
                <SortTh field="address"       label="Address"     {...sp} />
                <th className={cn("px-4 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider whitespace-nowrap", COL_TYPE_OF_WORKS)}>
                  Type of Works
                </th>
                <SortTh field="clientCompany" label="Client" className={COL_CLIENT} {...sp} />
                <th className={cn("px-4 py-2.5 text-left text-xs font-semibold text-t3 uppercase tracking-wider whitespace-nowrap", COL_REQUESTED_BY)}>
                  Requested By
                </th>
                <SortTh field="quoteValue" label="Quotation" className={COL_QUOTATION} {...sp} />
                <SortTh field="status"     label="Completion Status" {...sp} />
                <SortTh field="designer"   label="Designer" className={COL_DESIGNER} {...sp} />
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-t3 uppercase tracking-wider whitespace-nowrap min-w-[180px]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows /> :
               !data || data.jobs.length === 0 ? (
                <EmptyState hasFilters={hasFilters || isCheckingQueue} onCreate={() => setCreateOpen(true)} onClear={clearAllFilters} />
               ) : data.jobs.map(job => (
                <JobTableRow
                  key={job.id}
                  job={job}
                  isOnHold={!!(job.clientId && holdClientIds.has(job.clientId))}
                  designers={designers}
                  isAdmin={isAdmin}
                  creatingRevisionFor={creatingRevisionFor}
                  onPatchField={patchJobField}
                  onEdit={setEditJob}
                  onDelete={setDeleteJob}
                  onAssign={setAssignJob}
                  onQuickRevision={handleQuickRevision}
                  onNavigate={router.push}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pagination — shared by mobile cards and desktop table */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 mt-3 border border-bd rounded-xl bg-sr shadow-card">
          <p className="text-xs text-t3">
            {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, data.total)} of{" "}
            <span className="font-semibold text-t2">{data.total.toLocaleString()}</span>
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-t2 px-2 tabular-nums min-w-[56px] text-center">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={o => { if (!createSaving) setCreateOpen(o) }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New job</DialogTitle>
            <DialogDescription>Drawing number assigned automatically on save.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <JobForm key={createOpen ? "open" : "closed"} formId="create-job-form" onSubmit={handleCreate} designers={designers} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancel</Button>
            <Button type="submit" form="create-job-form" variant="primary" loading={createSaving} disabled={createSaving}>
              {createSaving ? "Creating…" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editJob} onOpenChange={o => { if (!o && !editSaving) setEditJob(null) }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
            <DialogDescription>Update job details and status.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {editJob && <JobForm key={editJob.id} formId="edit-job-form" job={editJob} onSubmit={handleEdit} designers={designers} />}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditJob(null)} disabled={editSaving}>Cancel</Button>
            <Button type="submit" form="edit-job-form" variant="primary" loading={editSaving} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!deleteJob} onOpenChange={o => {
        if (!o && !deleting) { setDeleteJob(null); setCancelReason("") }
      }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel job</DialogTitle>
            <DialogDescription>
              Cancel{" "}
              <span className="font-mono font-semibold text-ac">{deleteJob?.drawingNumber}</span>?
              The job moves to <strong>Archived Items</strong>. Its drawing number is kept on record and will not be reused. You can restore it later from Archive.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="block text-xs font-medium text-t2 mb-1.5">
              Reason for cancellation <span className="text-dn">*</span>
            </label>
            <Textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="e.g. Client withdrew, duplicate entry, project cancelled…"
              rows={3}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteJob(null); setCancelReason("") }} disabled={deleting}>
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
      {/* Assign designer modal — fallback for entering a brand-new name not yet in the inline picker */}
      <AssignDesignerModal
        job={assignJob}
        onClose={() => setAssignJob(null)}
        onSaved={updated => {
          setAssignJob(null)
          mutate(
            current => current ? { ...current, jobs: current.jobs.map(j => j.id === updated.id ? updated : j) } : current,
            { revalidate: false },
          )
          setDesigners(prev => updated.designer && !prev.includes(updated.designer)
            ? [...prev, updated.designer].sort() : prev)
        }}
      />
    </>
  )
}
