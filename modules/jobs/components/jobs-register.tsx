"use client"

import {
  useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Plus, SlidersHorizontal, X, Upload, Download,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { cn } from "@/shared/utils/utils"
import { ClientCombobox } from "@/components/client-combobox"
import type { Job, JobFormData, JobsResponse } from "@/lib/types"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import { JobsRegisterTable } from "./jobs-register-table"
import { JobsInspector } from "./jobs-inspector"
import { JobsInspectorErrorBoundary } from "./jobs-inspector-error-boundary"
import {
  JobsInspectorReopenHandle,
  JobsInspectorShell,
} from "./jobs-inspector-shell"
import { MobileJobsHeader } from "./mobile-jobs-header"
import { MobileJobsList } from "./mobile-jobs-list"
import {
  jobToRegisterProject,
  workItemToRegisterProject,
} from "./jobs-register-helpers"
import { exportJobsToCsv } from "./job-csv-export"
import type { JobsRegisterProject, JobsRegisterScope } from "./jobs-register-types"
import { useJobsRegisterKeyboard } from "./use-jobs-register-keyboard"

const JobsDialogs = lazy(() =>
  import("./jobs-dialogs").then(m => ({ default: m.JobsDialogs })),
)

const LIMIT = 100

interface WorkItemsResponse {
  workItems: MixedWorkloadRow[]
  total: number
  page: number
  pages: number
}

/**
 * Jobs Register + collapsible job-card Inspector.
 * Register expands full-width until a row is selected; inspector is ~36–38%.
 */
export function JobsRegister({
  workItemsModel,
  mode = "default",
}: {
  workItemsModel: boolean
  mode?: "default" | "checking"
}) {
  const isChecking = mode === "checking"
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { isAdmin } = useUser()

  const searchRef = useRef<HTMLInputElement>(null)
  const mobileSearchRef = useRef<HTMLInputElement>(null)
  const mobileListRef = useRef<HTMLDivElement>(null)
  const savedMobileListScroll = useRef(0)
  const { matches: isMobile, ready: mediaReady } = useClientMediaQuery("(max-width: 767px)")
  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 280)
  const [scope, setScope] = useState<JobsRegisterScope>("all")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("selected"))
  const [isInspectorOpen, setIsInspectorOpen] = useState(!!searchParams.get("selected"))
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [filterClientId, setFilterClientId] = useState(searchParams.get("clientId") ?? "")
  const [filtersOpen, setFiltersOpen] = useState(!!searchParams.get("clientId"))
  const { data: filterClientData } = useApi<{ client: { name: string } }>(
    filterClientId ? `/api/clients/${filterClientId}` : null,
  )
  const filterClientName = filterClientData?.client.name ?? ""

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true)
      const next = new URLSearchParams(searchParams.toString())
      next.delete("new")
      const qs = next.toString()
      router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => { setPage(1) }, [debouncedSearch, scope])

  const classicStatus = useMemo(() => {
    if (isChecking) return "CHECKING"
    if (scope === "completed") return "ISSUED"
    return "ALL"
  }, [isChecking, scope])


  const classicQs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(LIMIT))
    p.set("onlyOriginals", "true")
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    if (classicStatus && classicStatus !== "ALL") p.set("status", classicStatus)
    if (filterClientId) p.set("clientId", filterClientId)
    return p.toString()
  }, [page, debouncedSearch, classicStatus, filterClientId])

  const workQs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(LIMIT))
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    if (isChecking) p.set("status", "CHECKING")
    else if (scope === "completed") p.set("status", "ISSUED")
    if (filterClientId) p.set("clientId", filterClientId)
    return p.toString()
  }, [page, debouncedSearch, isChecking, scope, filterClientId])

  const classicKey = !workItemsModel ? `/api/jobs?${classicQs}` : null
  const workKey = workItemsModel ? `/api/work-items?${workQs}` : null

  const { data: classicData, isLoading: classicLoading, mutate: mutateClassic } =
    useApi<JobsResponse>(classicKey)
  const { data: workData, isLoading: workLoading, mutate: mutateWork } =
    useApi<WorkItemsResponse>(workKey)
  const { data: designersData } = useApi<{ designers: string[] }>("/api/jobs/designers")
  const designers = designersData?.designers ?? []

  const projects: JobsRegisterProject[] = useMemo(() => {
    if (workItemsModel) {
      const rows = workData?.workItems ?? []
      const mapped = rows.filter(Boolean).map(workItemToRegisterProject)
      const seen = new Set<string>()
      const deduped: JobsRegisterProject[] = []
      for (const row of mapped) {
        if (!row.id || seen.has(row.id)) continue
        seen.add(row.id)
        deduped.push(row)
      }
      if (scope === "active") return deduped.filter(p => p.currentWorkType !== "none")
      if (scope === "with_active_revision") {
        return deduped.filter(p => p.currentWorkType === "revision")
      }
      if (scope === "completed") {
        return deduped.filter(p => p.currentWorkType === "none")
      }
      return deduped
    }

    let mapped = (classicData?.jobs ?? []).filter(Boolean).map(jobToRegisterProject)
    if (scope === "active") mapped = mapped.filter(p => p.currentWorkType !== "none")
    if (scope === "with_active_revision") {
      mapped = mapped.filter(p => p.currentWorkType === "revision")
    }
    if (scope === "completed") mapped = mapped.filter(p => p.currentWorkType === "none")
    return mapped
  }, [workItemsModel, workData, classicData, scope])

  const total = workItemsModel ? (workData?.total ?? 0) : (classicData?.total ?? 0)
  const pages = workItemsModel
    ? (workData?.pages ?? 1)
    : Math.max(1, Math.ceil(total / LIMIT))
  const loading = workItemsModel ? workLoading : classicLoading
  const selected = projects.find(p => p.id === selectedId) ?? null
  const activeRevisions = projects.filter(p => p.currentWorkType === "revision").length

  useEffect(() => {
    if (selectedId && !projects.some(p => p.id === selectedId)) {
      setSelectedId(null)
      setIsInspectorOpen(false)
    }
  }, [projects, selectedId])

  const openWorkspaceById = useCallback((id: string) => {
    router.push(`/jobs/${id}`)
  }, [router])

  const selectProject = useCallback((id: string) => {
    if (mobileListRef.current) {
      savedMobileListScroll.current = mobileListRef.current.scrollTop
    }
    // Same row while collapsed → reopen; otherwise select and open.
    if (selectedId === id && !isInspectorOpen) {
      setIsInspectorOpen(true)
      return
    }
    setSelectedId(id)
    setIsInspectorOpen(true)
  }, [selectedId, isInspectorOpen])

  const collapseInspector = useCallback(() => {
    setIsInspectorOpen(false)
    requestAnimationFrame(() => {
      if (mobileListRef.current) {
        mobileListRef.current.scrollTop = savedMobileListScroll.current
      }
    })
  }, [])

  const reopenInspector = useCallback(() => {
    if (selectedId) setIsInspectorOpen(true)
  }, [selectedId])

  const navigateProjects = useCallback((dir: -1 | 1) => {
    if (projects.length === 0) return
    const idx = selectedId ? projects.findIndex(p => p.id === selectedId) : -1
    const next = Math.min(projects.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))
    const nextId = projects[next]?.id ?? null
    if (!nextId) return
    setSelectedId(nextId)
    setIsInspectorOpen(true)
  }, [projects, selectedId])

  useJobsRegisterKeyboard({
    onFocusSearch: () => {
      if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
        searchRef.current?.focus()
      } else {
        mobileSearchRef.current?.focus()
      }
    },
    onNavigate: navigateProjects,
    onAddRevision: () => {},
    onCloseInspector: collapseInspector,
  })

  const handleCreate = async (form: JobFormData) => {
    setCreateSaving(true)
    try {
      if (workItemsModel && (form.itemType || "DESIGN") === "DESIGN") {
        const res = await fetch("/api/parent-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string }
          toast(err.error ?? "Failed to create project", "error")
          return
        }
        const body = await res.json() as { parent?: { id: string } }
        toast("Project created", "success")
        setCreateOpen(false)
        await mutateWork()
        if (body.parent?.id) {
          setSelectedId(body.parent.id)
          setIsInspectorOpen(true)
        }
        return
      }

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast(err.error ?? "Failed to create job", "error")
        return
      }
      const job = await res.json() as Job
      toast(`${job.drawingNumber} created`, "success")
      setCreateOpen(false)
      await mutateClassic()
      setSelectedId(job.id)
      setIsInspectorOpen(true)
    } finally {
      setCreateSaving(false)
    }
  }

  const handleStatusChanged = useCallback(async () => {
    if (workItemsModel) await mutateWork()
    else await mutateClassic()
  }, [workItemsModel, mutateWork, mutateClassic])

  const onStatusChangedCb = useCallback(() => {
    void handleStatusChanged()
  }, [handleStatusChanged])

  const scopes: { id: JobsRegisterScope; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "with_active_revision", label: "With Active Revision" },
    { id: "completed", label: "Completed" },
  ]

  const inspectorVisible = Boolean(selected) && isInspectorOpen
  // Prefer CSS breakpoint for chrome; mount only one inspector to avoid duplicate fetches.
  // Before media is ready, mount the mobile drawer (hidden on md+) so phones never wait
  // on a desktop-only mount that stays display:none.
  const showMobileInspector = Boolean(
    inspectorVisible && selected && (!mediaReady || isMobile),
  )
  const showDesktopInspector = Boolean(
    inspectorVisible && selected && mediaReady && !isMobile,
  )

  // Lock background scroll while the mobile full-screen detail is open.
  useEffect(() => {
    if (!showMobileInspector) return
    const main = document.querySelector("main.oryx-app-main") as HTMLElement | null
    const prevBody = document.body.style.overflow
    const prevMain = main?.style.overflow ?? ""
    const prevMainTouch = main?.style.touchAction ?? ""
    document.body.style.overflow = "hidden"
    if (main) {
      main.style.overflow = "hidden"
      main.style.touchAction = "none"
    }
    return () => {
      document.body.style.overflow = prevBody
      if (main) {
        main.style.overflow = prevMain
        main.style.touchAction = prevMainTouch
      }
    }
  }, [showMobileInspector])

  const toolbarBtn =
    "inline-flex h-9 items-center gap-2 rounded border border-bd px-3 text-sm font-medium text-t1 transition-colors hover:bg-surface-low disabled:opacity-40"

  const handleExport = () => {
    void exportJobsToCsv(
      {
        search: debouncedSearch.trim(),
        statusFilter: classicStatus,
        itemTypeFilter: "ALL",
        typeOfWorksFilter: "ALL",
        deadlineFilter: "all",
        onlyOriginals: true,
        onlyRevisions: false,
      },
      toast,
    )
  }

  const summaryLabel = `${total.toLocaleString()} project${total === 1 ? "" : "s"} · ${activeRevisions} active revision${activeRevisions === 1 ? "" : "s"}`

  const title = isChecking ? "Checking queue" : "Jobs"
  const subtitle = isChecking
    ? "Work awaiting technical review before issue"
    : "Manage scaffold design projects, revisions and progress"

  return (
    <div className="-mx-8 -mt-8 -mb-8 flex h-[calc(100dvh-var(--stitch-top-bar-h,64px))] min-h-0 flex-col max-md:-mx-4 max-md:-mt-4 max-md:-mb-4">
      {/* ── Desktop layout ───────────────────────────────────────── */}
      <div className="hidden md:flex min-h-0 flex-1 gap-3 overflow-hidden bg-s0">
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-s1",
            "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
            inspectorVisible ? "min-w-0 flex-1" : "w-full",
          )}
        >
          <div className="border-b border-bd px-5 pt-4 pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 shrink-0">
                  <h1 className="text-2xl font-bold tracking-tight text-t1">{title}</h1>
                  <p className="mt-0.5 text-sm text-t3">{subtitle}</p>
                </div>

                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                  {!isChecking && (
                    <div className="relative w-full min-w-[180px] max-w-sm grow sm:grow-0 sm:w-56 lg:w-64">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
                      <Input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search project or drawing…"
                        className="h-9 border-bd bg-surface-low pl-8 pr-8 text-sm"
                        aria-label="Search projects"
                      />
                      {search && (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-t4 hover:text-t2"
                          onClick={() => setSearch("")}
                          aria-label="Clear search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {isChecking && (
                    <div className="relative w-full min-w-[180px] max-w-sm">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
                      <Input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search project or drawing…"
                        className="h-9 pl-8 text-sm"
                        aria-label="Search projects"
                      />
                    </div>
                  )}

                  {!isChecking && (
                    <>
                      <button
                        type="button"
                        className={cn(toolbarBtn, (filtersOpen || filterClientId) && "border-ac text-ac")}
                        onClick={() => setFiltersOpen(v => !v)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filters
                      </button>
                      <button type="button" className={toolbarBtn} onClick={handleExport}>
                        <Download className="h-3.5 w-3.5" />
                        Export
                      </button>
                      <button
                        type="button"
                        className={toolbarBtn}
                        onClick={() => router.push("/jobs/import")}
                        disabled={!isAdmin}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import
                      </button>
                      {isAdmin && (
                        <Button type="button" size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
                          <Plus className="h-3.5 w-3.5" />
                          New Job
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!isChecking && (
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Project scope">
                  {scopes.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={scope === s.id}
                      onClick={() => setScope(s.id)}
                      className={cn(
                        "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-all",
                        scope === s.id
                          ? "bg-ac text-on-ac"
                          : "border border-bd bg-surface-low text-t3 hover:border-ac hover:text-t1",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {filtersOpen && !isChecking && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-bd bg-s0 px-3 py-2.5">
                  <div className="min-w-[180px] flex-1">
                    <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-t4">Client</label>
                    <ClientCombobox
                      value={filterClientId}
                      name={filterClientName}
                      onChange={(clientId) => {
                        setFilterClientId(clientId)
                        setPage(1)
                      }}
                    />
                  </div>
                  {filterClientId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        setFilterClientId("")
                        setPage(1)
                      }}
                    >
                      Reset filters
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          <JobsRegisterTable
            projects={projects}
            selectedId={selectedId}
            onSelect={selectProject}
            onOpenWorkspace={openWorkspaceById}
            workItemsModel={workItemsModel}
            designers={designers}
            highlightQuery={debouncedSearch}
            onStatusChanged={onStatusChangedCb}
            onDesignerChanged={onStatusChangedCb}
            loading={loading}
          />

          <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-bd bg-s1/95 px-5 py-1.5 backdrop-blur-sm">
            <p className="text-[11px] text-t2 tabular-nums">
              <span className="font-semibold text-t1">{total.toLocaleString()}</span> Total Projects
              <span className="mx-2 text-bd">|</span>
              <span className="font-semibold text-t1">{activeRevisions}</span> Active Revisions
            </p>
            <div className="flex items-center gap-3">
              {pages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded border border-bd px-2 py-1 text-xs disabled:opacity-40"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className="px-1 text-xs tabular-nums text-t3">
                    {page}/{pages}
                  </span>
                  <button
                    type="button"
                    className="rounded border border-bd px-2 py-1 text-xs disabled:opacity-40"
                    disabled={page >= pages}
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              )}
              <p className="hidden items-center gap-1.5 text-[10px] uppercase tracking-wide text-t3 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-ok-ic" aria-hidden />
                System Operational
              </p>
            </div>
          </div>
        </section>

        {showDesktopInspector && selected && (
          <JobsInspectorShell
            className={cn(
              "my-3 mr-3 w-[min(420px,38%)] lg:w-[min(460px,39%)] shrink-0",
            )}
          >
            <JobsInspectorErrorBoundary projectLabel={selected.id}>
              <JobsInspector
                project={selected}
                workItemsModel={workItemsModel}
                designers={designers}
                onStatusChanged={onStatusChangedCb}
                onCollapse={collapseInspector}
                collapseVariant="chevron"
                presentation="panel"
              />
            </JobsInspectorErrorBoundary>
          </JobsInspectorShell>
        )}

        {selected && !isInspectorOpen && mediaReady && !isMobile && (
          <JobsInspectorReopenHandle onOpen={reopenInspector} />
        )}
      </div>

      {/* ── Mobile layout ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-s0 md:hidden">
        <MobileJobsHeader
          title={title}
          subtitle={subtitle}
          search={search}
          onSearchChange={setSearch}
          searchRef={mobileSearchRef}
          scope={scope}
          onScopeChange={setScope}
          showProjectActions={!isChecking}
          canCreate={isAdmin}
          canImport={isAdmin}
          onNewProject={() => setCreateOpen(true)}
          onFilters={() => router.push("/jobs/checking")}
          onExport={handleExport}
          onImport={() => router.push("/jobs/import")}
          summaryLabel={summaryLabel}
        />

        <MobileJobsList
          ref={mobileListRef}
          projects={projects}
          selectedId={selectedId}
          workItemsModel={workItemsModel}
          designers={designers}
          loading={loading}
          highlightQuery={debouncedSearch}
          onSelect={selectProject}
          onStatusChanged={onStatusChangedCb}
          onDesignerChanged={onStatusChangedCb}
        />

        {pages > 1 && (
          <div
            className="flex shrink-0 items-center justify-center gap-2 border-t border-bd bg-s1 px-4 py-2.5"
            style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              className="h-10 rounded-md border border-bd px-3 text-sm disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="px-2 text-sm tabular-nums text-t3">
              {page}/{pages}
            </span>
            <button
              type="button"
              className="h-10 rounded-md border border-bd px-3 text-sm disabled:opacity-40"
              disabled={page >= pages}
              onClick={() => setPage(p => Math.min(pages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Mobile full-screen job details — single scroll owner for content */}
      {showMobileInspector && selected && (
        <div
          className="mobile-job-detail fixed inset-0 z-50 flex h-screen max-h-screen flex-col overflow-hidden bg-s2 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`Project details for ${selected.drawingNumber}`}
          style={{
            height: "100dvh",
            maxHeight: "100dvh",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <JobsInspectorErrorBoundary projectLabel={selected.id}>
            <JobsInspector
              project={selected}
              workItemsModel={workItemsModel}
              designers={designers}
              onStatusChanged={onStatusChangedCb}
              onCollapse={collapseInspector}
              collapseVariant="close"
              presentation="drawer"
            />
          </JobsInspectorErrorBoundary>
        </div>
      )}

      <Suspense fallback={null}>
        {createOpen && (
          <JobsDialogs
            createOpen={createOpen}
            createSaving={createSaving}
            onCreateClose={() => setCreateOpen(false)}
            onCreateSubmit={handleCreate}
            editJob={null}
            editSaving={false}
            onEditClose={() => {}}
            onEditSubmit={async () => {}}
            deleteJob={null}
            deleting={false}
            cancelReason=""
            onCancelReasonChange={() => {}}
            onDeleteClose={() => {}}
            onDeleteConfirm={async () => {}}
            designers={designers}
          />
        )}
      </Suspense>
    </div>
  )
}
