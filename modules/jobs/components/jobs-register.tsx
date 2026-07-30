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
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { cn } from "@/shared/utils/utils"
import type { Job, JobFormData, JobsResponse } from "@/lib/types"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import { JobsRegisterTable } from "./jobs-register-table"
import { JobsInspector } from "./jobs-inspector"
import { JobsInspectorErrorBoundary } from "./jobs-inspector-error-boundary"
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
 * Jobs Register + persistent Inspector — Stitch Command Center layout.
 * 65% register / 35% inspector when a project is selected.
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
  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const debouncedSearch = useDebouncedValue(search, 280)
  const [scope, setScope] = useState<JobsRegisterScope>("all")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)

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
    return p.toString()
  }, [page, debouncedSearch, classicStatus])

  const workQs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(LIMIT))
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    if (isChecking) p.set("status", "CHECKING")
    else if (scope === "completed") p.set("status", "ISSUED")
    return p.toString()
  }, [page, debouncedSearch, isChecking, scope])

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
      if (scope === "active") return deduped.filter(p => p.currentStatus !== "ISSUED")
      return deduped
    }

    let mapped = (classicData?.jobs ?? []).filter(Boolean).map(jobToRegisterProject)
    if (scope === "active") mapped = mapped.filter(p => p.currentStatus !== "ISSUED")
    return mapped
  }, [workItemsModel, workData, classicData, scope])

  const total = workItemsModel ? (workData?.total ?? 0) : (classicData?.total ?? 0)
  const pages = workItemsModel
    ? (workData?.pages ?? 1)
    : Math.max(1, Math.ceil(total / LIMIT))
  const loading = workItemsModel ? workLoading : classicLoading
  const selected = projects.find(p => p.id === selectedId) ?? null
  const activeRevisions = projects.filter(p => p.currentStatus !== "ISSUED").length

  useEffect(() => {
    if (selectedId && !projects.some(p => p.id === selectedId)) setSelectedId(null)
  }, [projects, selectedId])

  // Auto-select first row so inspector stays the workspace (Stitch always shows it with selection)
  useEffect(() => {
    if (!selectedId && projects.length > 0 && !isChecking) {
      setSelectedId(projects[0].id)
    }
  }, [projects, selectedId, isChecking])

  const openWorkspace = useCallback(() => {
    if (!selected) return
    router.push(`/jobs/${selected.id}`)
  }, [router, selected])

  const navigateProjects = useCallback((dir: -1 | 1) => {
    if (projects.length === 0) return
    const idx = selectedId ? projects.findIndex(p => p.id === selectedId) : -1
    const next = Math.min(projects.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))
    setSelectedId(projects[next]?.id ?? null)
  }, [projects, selectedId])

  useJobsRegisterKeyboard({
    onFocusSearch: () => searchRef.current?.focus(),
    onNavigate: navigateProjects,
    onOpenWorkspace: openWorkspace,
    onAddRevision: () => { if (selected) openWorkspace() },
    onGenerateInvoice: () => { if (selected) openWorkspace() },
    onCloseInspector: () => {
      // Stitch keeps inspector as workspace — Esc clears selection only when intentional
      setSelectedId(null)
    },
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
        if (body.parent?.id) setSelectedId(body.parent.id)
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
    } finally {
      setCreateSaving(false)
    }
  }

  const scopes: { id: JobsRegisterScope; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
  ]

  const inspectorOpen = Boolean(selected)

  return (
    <div className="-mx-8 -mt-8 -mb-8 flex h-[calc(100vh-var(--stitch-top-bar-h,64px))] min-h-0 flex-col max-md:-mx-4 max-md:-mt-4 max-md:-mb-4">
      {/* Top search strip — mirrors Stitch header search weight */}
      {!isChecking && (
        <div className="flex items-center gap-3 border-b border-bd bg-sr px-6 py-3">
          <div className="relative flex-1 max-w-2xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
            <Input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search project or drawing number..."
              className="border-0 bg-surface-low pl-9 focus:ring-1 focus:ring-ac"
              aria-label="Search projects"
            />
            {search && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-t4 hover:text-t2"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Register 65% (full width when inspector closed on mobile) */}
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden border-r border-bd bg-sr",
            inspectorOpen ? "w-full md:w-[65%]" : "w-full",
          )}
        >
          <div className="px-6 pt-6 pb-3">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-t1 tracking-tight">
                  {isChecking ? "Checking queue" : "Jobs"}
                </h1>
                <p className="mt-1 text-sm text-t3">
                  {isChecking
                    ? "Work awaiting technical review before issue"
                    : "Manage scaffold design projects, revisions and progress"}
                </p>
              </div>
              {!isChecking && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded border border-bd px-3 py-2 text-sm font-medium text-t1 transition-colors hover:bg-surface-low"
                    onClick={() => router.push("/jobs/checking")}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filters
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded border border-bd px-3 py-2 text-sm font-medium text-t1 transition-colors hover:bg-surface-low"
                    onClick={() => {
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
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded border border-bd px-3 py-2 text-sm font-medium text-t1 transition-colors hover:bg-surface-low disabled:opacity-40"
                    onClick={() => router.push("/jobs/import")}
                    disabled={!isAdmin}
                  >
                    <Upload className="h-4 w-4" />
                    Import
                  </button>
                  {isAdmin && (
                    <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      New Project
                    </Button>
                  )}
                </div>
              )}
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
                      "rounded-full px-3 py-1 text-sm font-medium transition-all",
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

            {isChecking && (
              <div className="relative max-w-md mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search project or drawing number..."
                  className="pl-9"
                  aria-label="Search projects"
                />
              </div>
            )}
          </div>

          <JobsRegisterTable
            projects={projects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
          />

          <div className="flex items-center justify-between gap-3 border-t border-bd bg-sr px-6 py-2.5">
            <p className="text-xs text-t3 tabular-nums">
              <span className="font-medium text-t2">{total.toLocaleString()}</span> Total Projects
              <span className="mx-2 text-bd">|</span>
              <span className="font-medium text-t2">{activeRevisions}</span> Active Revisions
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
                  <span className="text-xs text-t3 tabular-nums px-1">
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
              <p className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-t3">
                <span className="h-1.5 w-1.5 rounded-full bg-ok-ic" aria-hidden />
                System Operational
              </p>
            </div>
          </div>
        </section>

        {/* Inspector 35% — persistent workspace */}
        {inspectorOpen && selected && (
          <section className="hidden md:flex min-h-0 w-[35%] shrink-0 flex-col overflow-hidden">
            <JobsInspectorErrorBoundary projectLabel={selected.id}>
              <JobsInspector
                project={selected}
                workItemsModel={workItemsModel}
                onOpenWorkspace={openWorkspace}
              />
            </JobsInspectorErrorBoundary>
          </section>
        )}
      </div>

      {/* Mobile inspector strip */}
      {selected && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-bd bg-sr p-3 shadow-modal">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold truncate text-t1">{selected.drawingNumber}</p>
              <p className="text-xs text-t3 truncate">{selected.clientCompany}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedId(null)}>
                Close
              </Button>
              <Button type="button" size="sm" onClick={openWorkspace}>
                Open
              </Button>
            </div>
          </div>
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
