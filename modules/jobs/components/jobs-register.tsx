"use client"

import {
  useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Plus, SlidersHorizontal, X, Upload, Download, ChevronLeft, ChevronRight,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useClientMediaQuery } from "@/shared/hooks/use-media-query"
import { useApi, optimisticListPrepend, apiFetch } from "@/shared/hooks/use-api"
import { preload } from "swr"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { cn } from "@/shared/utils/utils"
import { ClientCombobox } from "@/components/client-combobox"
import type { Job, JobFormData, JobsResponse } from "@/lib/types"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import { JobsRegisterTable } from "./jobs-register-table"
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
import { JOBS_REGISTER_SCOPES } from "./jobs-register-types"
import { useJobsRegisterKeyboard } from "./use-jobs-register-keyboard"
import { matchesJobsListScope, type JobsListScopeCounts } from "@/modules/jobs/lib/current-work"
import {
  applyClassicDesignerPatch,
  applyClassicStatusPatch,
  createPendingMutationGate,
  patchClassicJobsCache,
  patchWorkItemsCache,
  predictWorkTypeAfterStatusChange,
  snapshotClassicJobRow,
  type ClassicJobsListCache,
  type WorkItemsListCache,
} from "@/modules/jobs/lib/jobs-register-optimistic"
import { JOBS_REGISTER_LIVE_POLL_MS } from "@/modules/jobs/lib/jobs-register-live"
import { useJobsRegisterLive } from "@/modules/jobs/lib/use-jobs-register-live"

const JobsDialogs = lazy(() =>
  import("./jobs-dialogs").then(m => ({ default: m.JobsDialogs })),
)
const JobsInspector = lazy(() =>
  import("./jobs-inspector").then(m => ({ default: m.JobsInspector })),
)

const LIMIT = 100
/** Stable empty designers list — avoids breaking row memo when SWR is still loading. */
const EMPTY_DESIGNERS: string[] = []
/** Designers change rarely — longer client dedupe; still revalidates in background. */
const DESIGNERS_SWR = {
  dedupingInterval: 60_000,
  revalidateOnFocus: false,
  revalidateIfStale: true,
} as const

/** Hover/focus prefetch cooldown — avoids N inspector bursts while scrolling. */
const PREFETCH_COOLDOWN_MS = 30_000

function prefetchJobDetails(projectId: string, workItemsModel: boolean) {
  if (workItemsModel) {
    void preload(`/api/parent-jobs/${projectId}`, (url: string) =>
      apiFetch(url).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      }),
    )
    return
  }
  const inspectorUrl = `/api/jobs/${projectId}/inspector`
  void preload(inspectorUrl, (url: string) =>
    apiFetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
  )
}

interface WorkItemsResponse {
  workItems: MixedWorkloadRow[]
  total: number
  page: number
  pages: number
  scopeCounts?: JobsListScopeCounts
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
  const { isAdmin, canAccess } = useUser()
  const canCreateJobs = canAccess("jobs")
  const canImport = isAdmin

  const searchRef = useRef<HTMLInputElement>(null)
  const mobileSearchRef = useRef<HTMLInputElement>(null)
  const mobileListRef = useRef<HTMLDivElement>(null)
  const savedMobileListScroll = useRef(0)
  const { matches: isMobile, ready: mediaReady } = useClientMediaQuery("(max-width: 767px)")
  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 200)
  const [scope, setScope] = useState<JobsRegisterScope>("active")
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
    return "ALL"
  }, [isChecking])


  const classicQs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(LIMIT))
    p.set("onlyOriginals", "true")
    p.set("includeCounts", "true")
    if (!isChecking) p.set("scope", scope)
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    if (classicStatus && classicStatus !== "ALL") p.set("status", classicStatus)
    if (filterClientId) p.set("clientId", filterClientId)
    return p.toString()
  }, [page, debouncedSearch, classicStatus, filterClientId, isChecking, scope])

  const workQs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(LIMIT))
    if (!isChecking) p.set("scope", scope)
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    if (isChecking) p.set("status", "CHECKING")
    if (filterClientId) p.set("clientId", filterClientId)
    return p.toString()
  }, [page, debouncedSearch, isChecking, filterClientId, scope])

  const classicKey = !workItemsModel ? `/api/jobs?${classicQs}` : null
  const workKey = workItemsModel ? `/api/work-items?${workQs}` : null

  // Visibility-aware soft poll — Broadcast is primary; poll covers Realtime outages.
  const [listVisible, setListVisible] = useState(true)
  useEffect(() => {
    const sync = () => setListVisible(document.visibilityState !== "hidden")
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => document.removeEventListener("visibilitychange", sync)
  }, [])

  const LIST_SWR = useMemo(
    () => ({
      refreshInterval: listVisible ? JOBS_REGISTER_LIVE_POLL_MS : 0,
      revalidateOnFocus: false,
    }),
    [listVisible],
  )

  const { data: classicData, isLoading: classicLoading, mutate: mutateClassic } =
    useApi<JobsResponse>(classicKey, LIST_SWR)
  const { data: workData, isLoading: workLoading, mutate: mutateWork } =
    useApi<WorkItemsResponse>(workKey, LIST_SWR)
  const { data: designersData } = useApi<{ designers: string[] }>("/api/jobs/designers", DESIGNERS_SWR)
  const designers = designersData?.designers ?? EMPTY_DESIGNERS

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
      if (isChecking) return deduped
      return deduped.filter(p => matchesJobsListScope(p.currentWorkType, scope))
    }

    // Classic list applies scope server-side; keep a defensive client filter.
    let mapped = (classicData?.jobs ?? []).filter(Boolean).map(jobToRegisterProject)
    if (!isChecking) {
      mapped = mapped.filter(p => matchesJobsListScope(p.currentWorkType, scope))
    }
    return mapped
  }, [workItemsModel, workData, classicData, scope, isChecking])

  const scopeCounts = classicData?.scopeCounts ?? workData?.scopeCounts
  const total = workItemsModel ? (workData?.total ?? 0) : (classicData?.total ?? 0)
  const pages = workItemsModel
    ? (workData?.pages ?? 1)
    : Math.max(1, Math.ceil(total / LIMIT))
  const loading = workItemsModel ? workLoading : classicLoading
  const selected = projects.find(p => p.id === selectedId) ?? null
  const activeRevisions = scopeCounts?.revisions
    ?? projects.filter(p => p.currentWorkType === "revision").length

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
        void mutateWork()
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
      void optimisticListPrepend(mutateClassic, "jobs", job)
      setSelectedId(job.id)
      setIsInspectorOpen(true)
    } finally {
      setCreateSaving(false)
    }
  }

  /** Snapshots for rollback when a row is removed from the current scope page. */
  const classicRowSnapshots = useRef(new Map<string, Record<string, unknown>>())
  const classicListSnapshots = useRef(new Map<string, ClassicJobsListCache>())
  const pendingGate = useRef(createPendingMutationGate()).current
  const remoteReconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchCooldown = useRef(new Map<string, number>())

  const softRevalidateList = useCallback(() => {
    if (workItemsModel) void mutateWork(undefined, { revalidate: true })
    else void mutateClassic(undefined, { revalidate: true })
  }, [workItemsModel, mutateWork, mutateClassic])

  const softRevalidateWhenIdle = useCallback((projectId: string) => {
    if (pendingGate.end(projectId)) softRevalidateList()
  }, [pendingGate, softRevalidateList])

  /**
   * Debounced remote reconcile. Skips while local optimistic mutations are in
   * flight so a stale list fetch cannot overwrite newer row edits. Local
   * softRevalidateWhenIdle + soft poll cover the gap until pending drains.
   */
  const scheduleRemoteReconcile = useCallback(() => {
    if (remoteReconcileTimer.current) clearTimeout(remoteReconcileTimer.current)
    remoteReconcileTimer.current = setTimeout(() => {
      remoteReconcileTimer.current = null
      if (pendingGate.hasAnyPending()) return
      softRevalidateList()
    }, 120)
  }, [pendingGate, softRevalidateList])

  useEffect(() => () => {
    if (remoteReconcileTimer.current) clearTimeout(remoteReconcileTimer.current)
  }, [])

  useJobsRegisterLive({
    enabled: true,
    onRemoteChange: scheduleRemoteReconcile,
  })

  const findProject = useCallback(
    (projectId: string) => projects.find(p => p.id === projectId) ?? null,
    [projects],
  )

  const onStatusOptimistic = useCallback((projectId: string, nextStatus: string) => {
    pendingGate.begin(projectId)
    const project = findProject(projectId)
    const editingRevision = project?.currentWorkType === "revision"
    const nextWorkType = predictWorkTypeAfterStatusChange({
      previousWorkType: project?.currentWorkType ?? "original",
      nextStatus,
      projectStatus: project?.projectStatus ?? nextStatus,
    })

    if (workItemsModel) {
      void mutateWork(
        (current) => patchWorkItemsCache(current as WorkItemsListCache | undefined, {
          projectId,
          scope,
          nextWorkType,
          patch: row => ({ ...row, status: nextStatus }),
        }) as typeof current,
        { revalidate: false },
      )
      return
    }

    void mutateClassic(
      (current) => {
        const cache = current as ClassicJobsListCache | undefined
        if (cache?.jobs) {
          const row = cache.jobs.find(j => j.id === projectId)
          if (row) {
            classicRowSnapshots.current.set(projectId, snapshotClassicJobRow(row))
            classicListSnapshots.current.set(projectId, {
              ...cache,
              jobs: cache.jobs.map(j => ({ ...j })),
            })
          }
        }
        return patchClassicJobsCache(cache, {
          projectId,
          scope,
          nextWorkType,
          patch: job => applyClassicStatusPatch(job, {
            nextStatus,
            editingRevision: Boolean(editingRevision),
            nextWorkType,
          }),
        }) as typeof current
      },
      { revalidate: false },
    )
  }, [findProject, mutateClassic, mutateWork, pendingGate, scope, workItemsModel])

  const onStatusFailed = useCallback((projectId: string, previous: string) => {
    pendingGate.end(projectId)
    if (workItemsModel) {
      void mutateWork(
        (current) => patchWorkItemsCache(current as WorkItemsListCache | undefined, {
          projectId,
          scope: "all",
          patch: row => ({ ...row, status: previous }),
        }) as typeof current,
        { revalidate: true },
      )
      return
    }

    const listSnap = classicListSnapshots.current.get(projectId)
    classicListSnapshots.current.delete(projectId)
    classicRowSnapshots.current.delete(projectId)
    if (listSnap) {
      void mutateClassic(() => listSnap as never, { revalidate: true })
      return
    }
    void mutateClassic(
      (current) => patchClassicJobsCache(current as ClassicJobsListCache | undefined, {
        projectId,
        scope: "all",
        patch: job => applyClassicStatusPatch(job, {
          nextStatus: previous,
          editingRevision: false,
          nextWorkType: predictWorkTypeAfterStatusChange({
            previousWorkType: "original",
            nextStatus: previous,
            projectStatus: previous,
          }),
        }),
      }) as typeof current,
      { revalidate: true },
    )
  }, [mutateClassic, mutateWork, pendingGate, workItemsModel])

  const onDesignerOptimistic = useCallback((projectId: string, nextDesigner: string) => {
    pendingGate.begin(projectId)
    const project = findProject(projectId)
    const editingRevision = project?.currentWorkType === "revision"

    if (workItemsModel) {
      void mutateWork(
        (current) => patchWorkItemsCache(current as WorkItemsListCache | undefined, {
          projectId,
          scope: "all",
          patch: row => ({ ...row, designer: nextDesigner }),
        }) as typeof current,
        { revalidate: false },
      )
      return
    }

    void mutateClassic(
      (current) => {
        const cache = current as ClassicJobsListCache | undefined
        const row = cache?.jobs?.find(j => j.id === projectId)
        if (row) classicRowSnapshots.current.set(projectId, snapshotClassicJobRow(row))
        return patchClassicJobsCache(cache, {
          projectId,
          scope: "all",
          patch: job => applyClassicDesignerPatch(job, nextDesigner, Boolean(editingRevision)),
        }) as typeof current
      },
      { revalidate: false },
    )
  }, [findProject, mutateClassic, mutateWork, pendingGate, workItemsModel])

  const onDesignerFailed = useCallback((projectId: string, previous: string) => {
    pendingGate.end(projectId)
    if (workItemsModel) {
      void mutateWork(
        (current) => patchWorkItemsCache(current as WorkItemsListCache | undefined, {
          projectId,
          scope: "all",
          patch: row => ({ ...row, designer: previous }),
        }) as typeof current,
        { revalidate: true },
      )
      return
    }
    const snap = classicRowSnapshots.current.get(projectId)
    classicRowSnapshots.current.delete(projectId)
    void mutateClassic(
      (current) => patchClassicJobsCache(current as ClassicJobsListCache | undefined, {
        projectId,
        scope: "all",
        patch: job => (snap ? { ...job, ...snap } : applyClassicDesignerPatch(job, previous, false)),
      }) as typeof current,
      { revalidate: true },
    )
  }, [mutateClassic, mutateWork, pendingGate, workItemsModel])

  const onStatusChangedCb = useCallback((projectId: string, _next: string) => {
    classicListSnapshots.current.delete(projectId)
    classicRowSnapshots.current.delete(projectId)
    softRevalidateWhenIdle(projectId)
  }, [softRevalidateWhenIdle])

  const onInspectorStatusChanged = useCallback(() => {
    softRevalidateList()
  }, [softRevalidateList])

  const onDesignerChangedCb = useCallback((projectId: string, _nextDesigner: string) => {
    classicRowSnapshots.current.delete(projectId)
    softRevalidateWhenIdle(projectId)
  }, [softRevalidateWhenIdle])

  const onPrefetchProject = useCallback((id: string) => {
    const now = Date.now()
    const last = prefetchCooldown.current.get(id) ?? 0
    if (now - last < PREFETCH_COOLDOWN_MS) return
    prefetchCooldown.current.set(id, now)
    prefetchJobDetails(id, workItemsModel)
  }, [workItemsModel])

  const scopes = JOBS_REGISTER_SCOPES

  const scopeCountValue = (id: JobsRegisterScope): number | null => {
    if (!scopeCounts) return null
    return scopeCounts[id] ?? null
  }

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
  // After breakpoint is known, mount only the active layout tree.
  const mountDesktopChrome = !mediaReady || !isMobile
  const mountMobileChrome = !mediaReady || isMobile

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
    "inline-flex h-9 items-center gap-2 rounded border border-bd-strong bg-s1 px-3 text-sm font-medium text-t1 transition-colors hover:bg-jobs-row-hover disabled:opacity-40"

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

  const summaryLabel = `${total.toLocaleString()} project${total === 1 ? "" : "s"} · ${activeRevisions.toLocaleString()} active revision${activeRevisions === 1 ? "" : "s"}`

  const title = isChecking ? "Checking queue" : "Job List"
  const mobileTitle = isChecking ? "Checking queue" : "Job Registry"
  const subtitle = isChecking
    ? "Work awaiting technical review before issue"
    : "Manage and track live engineering projects across all sites."
  const mobileSubtitle = isChecking
    ? "Work awaiting technical review before issue"
    : "Active project directory."

  const pageWindow = useMemo(() => {
    const windowSize = 3
    if (pages <= windowSize) return Array.from({ length: pages }, (_, i) => i + 1)
    if (page <= 2) return [1, 2, 3].filter(p => p <= pages)
    if (page >= pages - 1) return [pages - 2, pages - 1, pages].filter(p => p >= 1)
    return [page - 1, page, page + 1]
  }, [page, pages])

  return (
    <div className="-mx-8 -mt-8 -mb-8 flex h-[calc(100dvh-var(--stitch-top-bar-h,64px))] min-h-0 flex-col max-md:-mx-4 max-md:-mt-4 max-md:-mb-4">
      {/* ── Desktop layout — floating Job Detail workspace ───────── */}
      {mountDesktopChrome ? (
      <div
        className={cn(
          "hidden md:flex min-h-0 flex-1 overflow-hidden bg-s0",
          inspectorVisible ? "gap-6 py-5 pr-6" : "",
        )}
      >
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden bg-s0",
            inspectorVisible ? "min-w-0 flex-1" : "w-full",
          )}
        >
          <div className="px-10 pt-8 pb-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="type-page-title text-t1">
                    {title}
                  </h1>
                  <p className="type-small mt-2 text-t3">{subtitle}</p>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                  {!isChecking && (
                    <div className="relative w-full min-w-[180px] max-w-sm grow sm:grow-0 sm:w-56 lg:w-64">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-t4" />
                      <Input
                        ref={searchRef}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search jobs, clients, or drawing numbers…"
                        className="h-9 border-bd bg-s1 pl-8 pr-8 text-sm"
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
                        className={cn(toolbarBtn, (filtersOpen || filterClientId) && "border-t1 text-t1")}
                        onClick={() => setFiltersOpen(v => !v)}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Filter
                      </button>
                      <button type="button" className={toolbarBtn} onClick={handleExport}>
                        <Download className="h-3.5 w-3.5" />
                        Export CSV
                      </button>
                      <button
                        type="button"
                        className={toolbarBtn}
                        onClick={() => router.push("/jobs/import")}
                        disabled={!canImport}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Import
                      </button>
                      {canCreateJobs && (
                        <Button type="button" size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
                          <Plus className="h-3.5 w-3.5" />
                          Create Job
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!isChecking && (
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Project scope">
                  {scopes.map(s => {
                    const count = scopeCountValue(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="tab"
                        aria-selected={scope === s.id}
                        onClick={() => setScope(s.id)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all",
                          "outline-none focus-visible:ring-2 focus-visible:ring-ac",
                          scope === s.id
                            ? "bg-t1 text-sr"
                            : "border border-bd bg-s1 text-t3 hover:border-t1 hover:text-t1",
                        )}
                      >
                        <span>{s.label}</span>
                        {count != null ? (
                          <span
                            className={cn(
                              "tabular-nums text-[11px] font-semibold",
                              scope === s.id ? "text-sr/80" : "text-t4",
                            )}
                          >
                            {count.toLocaleString()}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )}

              {filtersOpen && !isChecking && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-bd bg-s1 px-3 py-2.5">
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
            onOptimisticStatus={onStatusOptimistic}
            onStatusFailed={onStatusFailed}
            onDesignerChanged={onDesignerChangedCb}
            onOptimisticDesigner={onDesignerOptimistic}
            onDesignerFailed={onDesignerFailed}
            onPrefetch={onPrefetchProject}
            loading={loading}
          />

          <div className="flex shrink-0 items-center justify-between gap-3 px-10 py-4">
            <p className="text-xs text-t3 tabular-nums">
              Showing{" "}
              <span className="font-semibold text-t2">
                {projects.length.toLocaleString()}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-t2">{total.toLocaleString()}</span>{" "}
              jobs
              {activeRevisions > 0 ? (
                <>
                  <span className="mx-2 text-bd">·</span>
                  <span className="font-semibold text-t2">{activeRevisions}</span> active revisions
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg border border-bd p-2 text-t2 disabled:opacity-40 hover:bg-surface-low"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pages > 1 && pageWindow.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold tabular-nums transition-colors",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ac",
                    p === page
                      ? "bg-t1 text-sr"
                      : "text-t2 hover:bg-surface-low",
                  )}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="rounded-lg border border-bd p-2 text-t2 disabled:opacity-40 hover:bg-surface-low"
                disabled={page >= pages}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {showDesktopInspector && selected && (
          <JobsInspectorShell>
            <JobsInspectorErrorBoundary projectLabel={selected.id}>
              <Suspense
                fallback={
                  <div className="flex h-full min-h-[12rem] flex-col gap-3 p-4" aria-busy>
                    <div className="h-8 w-2/3 skeleton rounded-md" />
                    <div className="h-24 skeleton rounded-md" />
                    <div className="h-40 skeleton rounded-md" />
                  </div>
                }
              >
                <JobsInspector
                  project={selected}
                  workItemsModel={workItemsModel}
                  designers={designers}
                  onStatusChanged={onInspectorStatusChanged}
                  onCollapse={collapseInspector}
                  collapseVariant="close"
                  presentation="panel"
                  onEdit={() => openWorkspaceById(selected.id)}
                />
              </Suspense>
            </JobsInspectorErrorBoundary>
          </JobsInspectorShell>
        )}

        {selected && !isInspectorOpen && mediaReady && !isMobile && (
          <JobsInspectorReopenHandle onOpen={reopenInspector} />
        )}
      </div>
      ) : null}

      {/* ── Mobile layout ────────────────────────────────────────── */}
      {mountMobileChrome ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-s0 md:hidden">
        <MobileJobsHeader
          title={mobileTitle}
          subtitle={mobileSubtitle}
          search={search}
          onSearchChange={setSearch}
          searchRef={mobileSearchRef}
          scope={scope}
          onScopeChange={setScope}
          scopeCounts={scopeCounts}
          showProjectActions={!isChecking}
          canCreate={canCreateJobs}
          canImport={canImport}
          onNewProject={() => setCreateOpen(true)}
          onFilters={() => setFiltersOpen(v => !v)}
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
          onOptimisticStatus={onStatusOptimistic}
          onStatusFailed={onStatusFailed}
          onDesignerChanged={onDesignerChangedCb}
          onOptimisticDesigner={onDesignerOptimistic}
          onDesignerFailed={onDesignerFailed}
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
      ) : null}

      {/* Mobile full-screen job details — single scroll owner for content */}
      {showMobileInspector && selected && (
        <div
          className="mobile-job-detail fixed inset-0 z-50 flex h-screen max-h-screen flex-col overflow-hidden bg-jobs-panel md:hidden"
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
            <Suspense
              fallback={
                <div className="flex flex-1 flex-col gap-3 p-4" aria-busy>
                  <div className="h-8 w-2/3 skeleton rounded-md" />
                  <div className="h-24 skeleton rounded-md" />
                  <div className="h-40 skeleton rounded-md" />
                </div>
              }
            >
              <JobsInspector
                project={selected}
                workItemsModel={workItemsModel}
                designers={designers}
                onStatusChanged={onInspectorStatusChanged}
                onCollapse={collapseInspector}
                collapseVariant="close"
                presentation="drawer"
                onEdit={() => openWorkspaceById(selected.id)}
              />
            </Suspense>
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
