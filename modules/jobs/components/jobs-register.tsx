"use client"

import {
  useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Search, Plus, Download, Upload, SlidersHorizontal, X, ClipboardCheck,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { cn } from "@/shared/utils/utils"
import { TablePagination } from "@/shared/layouts/page-layout"
import type { Job, JobFormData, JobsResponse } from "@/lib/types"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import { JobsRegisterTable } from "./jobs-register-table"
import { JobsInspector } from "./jobs-inspector"
import {
  jobToRegisterProject,
  workItemToRegisterProject,
} from "./jobs-register-helpers"
import type { JobsRegisterProject } from "./jobs-register-types"
import { useJobsRegisterKeyboard } from "./use-jobs-register-keyboard"
import { exportJobsToCsv } from "./job-csv-export"

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

type Scope = "all" | "active" | "completed" | "awaiting_client"

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
  const [scope, setScope] = useState<Scope>("all")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

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
    if (scope === "awaiting_client") return "READY_TO_SEND"
    if (scope === "active") return "" // filtered client-side for non-issued
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
    else if (scope === "awaiting_client") p.set("status", "READY_TO_SEND")
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
      const mapped = rows.map(workItemToRegisterProject)
      // One row per project — keep first (most recent active) per parent.
      const seen = new Set<string>()
      const deduped: JobsRegisterProject[] = []
      for (const row of mapped) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        deduped.push(row)
      }
      if (scope === "active") {
        return deduped.filter(p => p.currentStatus !== "ISSUED")
      }
      return deduped
    }

    const jobs = classicData?.jobs ?? []
    let mapped = jobs.map(jobToRegisterProject)
    if (scope === "active") {
      mapped = mapped.filter(p => p.currentStatus !== "ISSUED")
    }
    return mapped
  }, [workItemsModel, workData, classicData, scope])

  const total = workItemsModel ? (workData?.total ?? 0) : (classicData?.total ?? 0)
  const pages = workItemsModel
    ? (workData?.pages ?? 1)
    : Math.max(1, Math.ceil(total / LIMIT))
  const loading = workItemsModel ? workLoading : classicLoading

  const selected = projects.find(p => p.id === selectedId) ?? null

  // Keep selection valid when filters change.
  useEffect(() => {
    if (selectedId && !projects.some(p => p.id === selectedId)) {
      setSelectedId(null)
    }
  }, [projects, selectedId])

  const openWorkspace = useCallback(() => {
    if (!selected) return
    router.push(`/jobs/${selected.id}`)
  }, [router, selected])

  const navigateProjects = useCallback((dir: -1 | 1) => {
    if (projects.length === 0) return
    const idx = selectedId
      ? projects.findIndex(p => p.id === selectedId)
      : -1
    const next = Math.min(projects.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))
    setSelectedId(projects[next]?.id ?? null)
  }, [projects, selectedId])

  useJobsRegisterKeyboard({
    onFocusSearch: () => searchRef.current?.focus(),
    onNavigate: navigateProjects,
    onOpenWorkspace: openWorkspace,
    onAddRevision: () => {
      if (selected) openWorkspace()
    },
    onGenerateInvoice: () => {
      if (selected) openWorkspace()
    },
    onCloseInspector: () => setSelectedId(null),
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
        if (body.parent?.id) router.push(`/jobs/${body.parent.id}`)
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

  const scopes: { id: Scope; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
    { id: "awaiting_client", label: "Awaiting Client" },
  ]

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      {!isChecking && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="oryx-page-title text-t1">Jobs</h1>
            <p className="mt-1 text-sm text-t3">
              Manage scaffold design projects, revisions and commercial progress.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFiltersOpen(v => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </Button>
            {isAdmin && !workItemsModel && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  void exportJobsToCsv(
                    {
                      search: debouncedSearch,
                      statusFilter: classicStatus || "ALL",
                      itemTypeFilter: "ALL",
                      typeOfWorksFilter: "ALL",
                      deadlineFilter: "ALL",
                      onlyOriginals: true,
                      onlyRevisions: false,
                    },
                    toast,
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            )}
            {isAdmin && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => router.push("/jobs/import")}
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => router.push("/jobs/checking")}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Checking queue
            </Button>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New Project
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
          <Input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project or drawing number…"
            className="pl-9"
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
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  scope === s.id
                    ? "bg-ac text-on-ac"
                    : "bg-surface-low text-t2 hover:bg-nav-hover",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtersOpen && (
        <div className="rounded-xl border border-bd bg-sr px-4 py-3 text-sm text-t3">
          Use scope tabs for Active / Completed / Awaiting Client. Full filter bar remains available on the checking queue and import tools.
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-bd bg-pg">
        <div className="flex min-w-0 flex-1 flex-col">
          <JobsRegisterTable
            projects={projects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            className="rounded-none border-0"
          />
          <div className="flex items-center justify-between gap-3 border-t border-bd bg-sr px-4 py-2">
            <p className="text-xs text-t3 tabular-nums">
              {total.toLocaleString()} total projects
              {selected ? " · Inspector open" : ""}
            </p>
            <TablePagination
              page={page}
              totalPages={pages}
              onPageChange={setPage}
              total={total}
              pageSize={LIMIT}
              hideWhenSingle={false}
              variant="bare"
            />
          </div>
        </div>

        {selected && (
          <div className="hidden md:flex shrink-0">
            <JobsInspector
              project={selected}
              workItemsModel={workItemsModel}
              onClose={() => setSelectedId(null)}
              onOpenWorkspace={openWorkspace}
            />
          </div>
        )}
      </div>

      {/* Mobile: inspector as bottom sheet substitute — open workspace on select for small screens */}
      {selected && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-bd bg-sr p-3 shadow-modal">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="type-drawing-number truncate text-t1">{selected.drawingNumber}</p>
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
