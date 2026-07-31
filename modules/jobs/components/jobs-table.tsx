"use client"
import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Plus, Download, Upload, SlidersHorizontal,
  X, ClipboardCheck,
} from "lucide-react"
import { Button }   from "@/shared/ui/button"
import { Input }    from "@/shared/ui/input"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useApi, optimisticListRemove, optimisticListPrepend } from "@/shared/hooks/use-api"
import { useToast }      from "@/shared/ui/toast"
import { useUser }       from "@/shared/providers/user-context"
import { cn } from "@/shared/utils/utils"
import { ToolbarCard, DataPanel, TablePagination } from "@/shared/layouts/page-layout"
import { notifyRevisionsChanged } from "@/lib/revision-events"
import type { Job, JobFormData, JobsResponse, SortField, SortDir } from "@/lib/types"
import { WORK_ITEM_TYPES } from "@/lib/constants"
import { LIMIT, COL_TYPE_OF_WORKS, COL_CLIENT, COL_REQUESTED_BY, COL_QUOTATION, COL_DESIGNER } from "./jobs-table-columns"
import {
  SkeletonRows, EmptyState, SortTh, JobMobileCard, JobTableRow,
} from "./jobs-table-row"
import { JobsActiveFilterChips, JobsFilterBar } from "./jobs-filter-bar"
import { exportJobsToCsv } from "./job-csv-export"
import { JobsDialogs } from "./jobs-dialogs"
import { AddRevisionModal } from "./add-revision-modal"

/** Filter keys persisted to sessionStorage per user. */
interface JobsFilterState {
  search: string
  statusFilter: string
  onlyOriginals: boolean
  onlyRevisions: boolean
  itemTypeFilter: string
  typeOfWorksFilter: string
  deadlineFilter: string
}

const DEFAULT_FILTERS: JobsFilterState = {
  search: "",
  statusFilter: "ALL",
  onlyOriginals: false,
  onlyRevisions: false,
  itemTypeFilter: "ALL",
  typeOfWorksFilter: "ALL",
  deadlineFilter: "ALL",
}

const VALID_DEADLINE_VALUES = new Set(["ALL", "overdue", "today", "this_week"])
const VALID_ITEM_TYPE_VALUES = new Set(["ALL", ...WORK_ITEM_TYPES.map(t => t.value)])

function sessionKey(userId: string): string {
  return `oryx_jobs_filters_${userId}`
}

function loadFilters(userId: string | undefined): JobsFilterState {
  if (!userId || typeof sessionStorage === "undefined") return DEFAULT_FILTERS
  try {
    const raw = sessionStorage.getItem(sessionKey(userId))
    if (!raw) return DEFAULT_FILTERS
    const parsed = JSON.parse(raw) as Partial<JobsFilterState>
    return {
      search: typeof parsed.search === "string" ? parsed.search : DEFAULT_FILTERS.search,
      statusFilter: typeof parsed.statusFilter === "string" ? parsed.statusFilter : DEFAULT_FILTERS.statusFilter,
      onlyOriginals: typeof parsed.onlyOriginals === "boolean" ? parsed.onlyOriginals : DEFAULT_FILTERS.onlyOriginals,
      onlyRevisions: typeof parsed.onlyRevisions === "boolean" ? parsed.onlyRevisions : DEFAULT_FILTERS.onlyRevisions,
      itemTypeFilter: typeof parsed.itemTypeFilter === "string" && VALID_ITEM_TYPE_VALUES.has(parsed.itemTypeFilter) ? parsed.itemTypeFilter : DEFAULT_FILTERS.itemTypeFilter,
      typeOfWorksFilter: typeof parsed.typeOfWorksFilter === "string" ? parsed.typeOfWorksFilter : DEFAULT_FILTERS.typeOfWorksFilter,
      deadlineFilter: typeof parsed.deadlineFilter === "string" && VALID_DEADLINE_VALUES.has(parsed.deadlineFilter) ? parsed.deadlineFilter : DEFAULT_FILTERS.deadlineFilter,
    }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(userId: string | undefined, state: JobsFilterState): void {
  if (!userId || typeof sessionStorage === "undefined") return
  const isDefault = state.search === DEFAULT_FILTERS.search
    && state.statusFilter === DEFAULT_FILTERS.statusFilter
    && state.onlyOriginals === DEFAULT_FILTERS.onlyOriginals
    && state.onlyRevisions === DEFAULT_FILTERS.onlyRevisions
    && state.itemTypeFilter === DEFAULT_FILTERS.itemTypeFilter
    && state.typeOfWorksFilter === DEFAULT_FILTERS.typeOfWorksFilter
    && state.deadlineFilter === DEFAULT_FILTERS.deadlineFilter
  if (isDefault) {
    sessionStorage.removeItem(sessionKey(userId))
    return
  }
  try { sessionStorage.setItem(sessionKey(userId), JSON.stringify(state)) } catch { /* quota */ }
}

export function JobsTable({ mode = "default" }: { mode?: "default" | "checking" }) {
  const isCheckingQueue = mode === "checking"
  const router       = useRouter()
  const { toast }    = useToast()
  const { isAdmin, user } = useUser()
  const userId = user?.id

  const { matches: isMobile, ready: mediaReady } = useClientMediaQuery("(max-width: 767px)")
  const searchParams = useSearchParams()

  // Initialise filters: URL params override sessionStorage; sessionStorage overrides defaults.
  const initFilters = useMemo(() => {
    const stored = loadFilters(userId)
    return {
      search: searchParams.get("search") ?? stored.search,
      statusFilter: isCheckingQueue ? "CHECKING" : (searchParams.get("status") ?? stored.statusFilter),
      onlyOriginals: searchParams.has("onlyOriginals") ? searchParams.get("onlyOriginals") === "true" : stored.onlyOriginals,
      onlyRevisions: searchParams.has("onlyRevisions") ? searchParams.get("onlyRevisions") === "true" : stored.onlyRevisions,
      itemTypeFilter: searchParams.get("itemType") ?? stored.itemTypeFilter,
      typeOfWorksFilter: searchParams.get("typeOfWorks") ?? stored.typeOfWorksFilter,
      deadlineFilter: searchParams.get("deadline") ?? stored.deadlineFilter,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [search,       setSearch]       = useState(initFilters.search)
  const debouncedSearch = useDebouncedValue(search, 280)
  const [statusFilter,  setStatusFilter]  = useState(initFilters.statusFilter)
  const [onlyOriginals, setOnlyOriginals] = useState(initFilters.onlyOriginals)
  const [onlyRevisions, setOnlyRevisions] = useState(initFilters.onlyRevisions)
  const [itemTypeFilter, setItemTypeFilter] = useState(initFilters.itemTypeFilter)
  const [typeOfWorksFilter, setTypeOfWorksFilter] = useState(initFilters.typeOfWorksFilter)
  const [deadlineFilter,  setDeadlineFilter]  = useState(initFilters.deadlineFilter)
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
  const [creatingRevisionFor, setCreatingRevisionFor] = useState<string | null>(null)
  const [revisionModalJob, setRevisionModalJob] = useState<Job | null>(null)

  useEffect(() => {
    if (searchParams.get("new") !== "1") return
    setCreateOpen(true)
    const next = new URLSearchParams(searchParams.toString())
    next.delete("new")
    const qs = next.toString()
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false })
  }, [searchParams, router])

  useEffect(() => { setPage(1) }, [debouncedSearch])

  // Persist filter state to sessionStorage (per user) whenever it changes.
  useEffect(() => {
    saveFilters(userId, {
      search: debouncedSearch,
      statusFilter: isCheckingQueue ? "ALL" : statusFilter,
      onlyOriginals,
      onlyRevisions,
      itemTypeFilter,
      typeOfWorksFilter,
      deadlineFilter,
    })
  }, [userId, debouncedSearch, statusFilter, onlyOriginals, onlyRevisions, itemTypeFilter, typeOfWorksFilter, deadlineFilter, isCheckingQueue])

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

  const holdClientIds = useMemo(
    () => new Set(holdData?.holds.map(h => h.clientId) ?? []),
    [holdData],
  )
  const designers = designersData?.designers ?? []

  const loading = isLoading && !data
  const refreshing = isValidating && !!data
  const showListTags = debouncedSearch.trim().length > 0
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
    if (userId && typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(sessionKey(userId))
    }
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
    const targetId = job.id
    await mutate(
      current => current ? { ...current, jobs: current.jobs.map(j => j.id === job.id ? { ...j, [field]: value } : j) } : current,
      { revalidate: false },
    )
    try {
      const res = await fetch(`/api/jobs/${targetId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        toast(field === "status" ? "Failed to change status" : "Failed to assign designer", "error")
        await mutate()
        return
      }
      const updated = await res.json() as Job
      // Keep parent row id in the list; overlay the patched fields from the current revision.
      // Preserve revision-family flags (canAddRevision, etc.) — the PATCH body is a raw JobRow.
      await mutate(
        current => current ? {
          ...current,
          jobs: current.jobs.map(j => j.id === job.id
            ? {
                ...j,
                [field]: value,
                status: field === "status" ? value : (j.status),
                designer: field === "designer" ? value : (j.designer),
                currentRevisionId: j.currentRevisionId ?? updated.id,
                updatedAt: updated.updatedAt,
              }
            : j),
        } : current,
        { revalidate: false },
      )
    } catch {
      toast("Network error", "error")
      await mutate()
    }
  }, [mutate, toast])

  // Perf: stable handlers so JobMobileCard memo is not busted by inline lambdas per row.
  const openJob = useCallback((jobId: string) => { router.push(`/jobs/${jobId}`) }, [router])
  const navigateTo = useCallback((path: string) => { router.push(path) }, [router])
  const patchMobileStatus = useCallback((job: Job, status: string) => {
    void patchJobField(job, "status", status)
  }, [patchJobField])

  // Open the revision modal instead of creating immediately.
  const handleQuickRevision = useCallback((job: Job) => {
    setRevisionModalJob(job)
  }, [])

  // Called when the user confirms the revision modal form.
  const handleRevisionSubmit = useCallback(async (
    job: Job,
    data: { notes: string; billable: boolean; quoteValue: number; requiredByDate: string },
  ) => {
    const parentId = job.parentJobId ?? job.id
    setCreatingRevisionFor(job.id)
    try {
      const res = await fetch(`/api/jobs/${parentId}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to create revision", "error")
        throw new Error(body.error ?? "Failed")
      }
      const revision = await res.json() as Job
      toast(`${revision.drawingNumber} added successfully`, "success")
      notifyRevisionsChanged(parentId)
      setRevisionModalJob(null)
      mutate()
    } finally { setCreatingRevisionFor(null) }
  }, [mutate, toast])

  const handleExport = async () => {
    await exportJobsToCsv(
      {
        search,
        statusFilter,
        itemTypeFilter,
        typeOfWorksFilter,
        deadlineFilter,
        onlyOriginals,
        onlyRevisions,
      },
      toast,
    )
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
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
          <Input
            id="jobs-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="pl-10 pr-8 h-9 rounded-lg bg-surface-low border border-bd shadow-none"
            style={{ paddingLeft: "40px", height: "36px" }}
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
            <span className="ml-1 bg-ac text-on-ac rounded-full h-4 w-4 type-helper flex items-center justify-center font-bold shrink-0">{activeFilterCount}</span>
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
      <JobsActiveFilterChips
        isCheckingQueue={isCheckingQueue}
        hasFilters={hasFilters}
        search={search}
        statusFilter={statusFilter}
        deadlineFilter={deadlineFilter}
        itemTypeFilter={itemTypeFilter}
        typeOfWorksFilter={typeOfWorksFilter}
        onlyOriginals={onlyOriginals}
        onlyRevisions={onlyRevisions}
        clearStatusFilter={clearStatusFilter}
        setDeadlineFilter={setDeadlineFilter}
        setItemTypeFilter={setItemTypeFilter}
        setTypeOfWorksFilter={setTypeOfWorksFilter}
        setOnlyOriginals={setOnlyOriginals}
        setOnlyRevisions={setOnlyRevisions}
        setSearch={setSearch}
        setPage={setPage}
        clearAllFilters={clearAllFilters}
      />

      {/* Filter bar */}
      {showFilters && (
        <JobsFilterBar
          statusFilter={statusFilter}
          applyStatusFilter={applyStatusFilter}
          typeOfWorksFilter={typeOfWorksFilter}
          setTypeOfWorksFilter={setTypeOfWorksFilter}
          itemTypeFilter={itemTypeFilter}
          setItemTypeFilter={setItemTypeFilter}
          deadlineFilter={deadlineFilter}
          setDeadlineFilter={setDeadlineFilter}
          hasFilters={hasFilters}
          isCheckingQueue={isCheckingQueue}
          clearAllFilters={clearAllFilters}
          setPage={setPage}
        />
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
      {mediaReady && isMobile && (
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
              showTags={showListTags}
              onOpen={openJob}
              onNavigate={navigateTo}
              onStatusChange={patchMobileStatus}
            />
          ))}
          </div>
        )}
      </div>
      )}

      {/* Desktop table — show until media is ready to avoid a mobile flash on SSR */}
      {(!mediaReady || !isMobile) && (
      <DataPanel className={cn("transition-opacity", refreshing && "opacity-60")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-low border-b border-bd">
                <SortTh field="drawingNumber" label="Drawing No." {...sp} />
                <SortTh field="address" label="Address"     {...sp} />
                <th className={cn("px-4 py-2.5 text-left type-table-head text-t3 whitespace-nowrap", COL_TYPE_OF_WORKS)}>
                  Type of Works
                </th>
                <SortTh field="clientCompany" label="Client" className={COL_CLIENT} {...sp} />
                <th className={cn("px-4 py-2.5 text-left type-table-head text-t3 whitespace-nowrap", COL_REQUESTED_BY)}>
                  Requested By
                </th>
                <SortTh field="quoteValue" label="Quotation" className={COL_QUOTATION} {...sp} />
                <SortTh field="status" label="Completion Status" {...sp} />
                <SortTh field="designer" label="Designer" className={COL_DESIGNER} {...sp} />
                <th className="px-4 py-2.5 text-right type-table-head text-t3 whitespace-nowrap min-w-[180px]">
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
                  showTags={showListTags}
                  onPatchField={patchJobField}
                  onEdit={setEditJob}
                  onDelete={setDeleteJob}
                  onQuickRevision={handleQuickRevision}
                  onNavigate={router.push}
                />
              ))}
            </tbody>
          </table>
        </div>
      </DataPanel>
      )}

      <TablePagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={data?.total}
        pageSize={LIMIT}
      />

      <JobsDialogs
        createOpen={createOpen}
        createSaving={createSaving}
        onCreateClose={() => setCreateOpen(false)}
        onCreateSubmit={handleCreate}
        editJob={editJob}
        editSaving={editSaving}
        onEditClose={() => setEditJob(null)}
        onEditSubmit={handleEdit}
        deleteJob={deleteJob}
        deleting={deleting}
        cancelReason={cancelReason}
        onCancelReasonChange={setCancelReason}
        onDeleteClose={() => { setDeleteJob(null); setCancelReason("") }}
        onDeleteConfirm={handleDelete}
        designers={designers}
      />

      <AddRevisionModal
        job={revisionModalJob}
        onClose={() => setRevisionModalJob(null)}
        onSubmit={handleRevisionSubmit}
      />
    </>
  )
}
