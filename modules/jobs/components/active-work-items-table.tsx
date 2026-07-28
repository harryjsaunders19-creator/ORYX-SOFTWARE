"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Search, Plus, FolderOpen, GitBranch,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { JOB_ROW_BG, JOB_ROW_BORDER } from "@/components/status-badge"
import { WorkItemTypeBadge } from "@/components/work-item-type-badge"
import { InlineStatusSelect } from "@/components/inline-edit-selects"
import dynamic from "next/dynamic"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useApi } from "@/shared/hooks/use-api"
import { useToast } from "@/shared/ui/toast"
import { JOB_STATUSES } from "@/lib/constants"
import { cn, getJobDeadlineInfo } from "@/shared/utils/utils"
import { ToolbarCard, DataPanel, TablePagination } from "@/shared/layouts/page-layout"
import type { MixedWorkloadRow } from "@/modules/jobs/services/mixed-workload-service"
import type { JobFormData } from "@/lib/types"

const JobForm = dynamic(() => import("./job-form").then(m => m.JobForm), { ssr: false })

const LIMIT = 25

interface WorkItemsResponse {
  workItems: MixedWorkloadRow[]
  total: number
  page: number
  pages: number
}

export function ActiveWorkItemsTable({
  mode = "all",
}: {
  mode?: "all" | "checking"
} = {}) {
  const router = useRouter()
  const { toast } = useToast()
  const checking = mode === "checking"

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [status, setStatus] = useState(checking ? "CHECKING" : "")
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    p.set("page", String(page))
    p.set("limit", String(LIMIT))
    if (debouncedSearch.trim()) p.set("search", debouncedSearch.trim())
    const effectiveStatus = checking ? "CHECKING" : status
    if (effectiveStatus) p.set("status", effectiveStatus)
    return p.toString()
  }, [page, debouncedSearch, status, checking])

  const { data, isLoading, mutate } = useApi<WorkItemsResponse>(`/api/work-items?${qs}`)

  const parentSearchKey = !checking && debouncedSearch.trim().length >= 2
    ? `/api/parent-jobs?search=${encodeURIComponent(debouncedSearch.trim())}&limit=5`
    : null
  const { data: parentHits } = useApi<{ parents: { id: string; drawingNumber: string; clientCompany: string; siteName: string | null }[] }>(
    parentSearchKey,
  )

  const rows = data?.workItems ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const matchingParents = parentHits?.parents ?? []

  const patchField = async (row: MixedWorkloadRow, body: Record<string, unknown>) => {
    const url = row.kind === "job" ? `/api/jobs/${row.id}` : `/api/work-items/${row.id}`
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      toast(err.error ?? "Update failed", "error")
      return
    }
    await mutate()
  }

  const handleCreate = async (form: JobFormData) => {
    setCreateSaving(true)
    try {
      const itemType = form.itemType || "DESIGN"
      if (itemType === "DESIGN") {
        const res = await fetch("/api/parent-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string }
          toast(err.error ?? "Failed to create job", "error")
          throw new Error("create failed")
        }
        const dash = await res.json() as { parent: { id: string } }
        toast("Project created", "success")
        setCreateOpen(false)
        router.push(`/jobs/${dash.parent.id}`)
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
        throw new Error("create failed")
      }
      const job = await res.json() as { id: string }
      toast("Job created", "success")
      setCreateOpen(false)
      router.push(`/jobs/${job.id}`)
    } finally {
      setCreateSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <ToolbarCard>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4" />
            <Input
              className="pl-9 bg-surface-low border border-bd shadow-none h-9 rounded-lg"
              style={{ paddingLeft: "36px", height: "36px" }}
              placeholder="Search drawing, client, site…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          {!checking && (
            <Select value={status || "__all"} onValueChange={v => { setStatus(v === "__all" ? "" : v); setPage(1) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Active statuses</SelectItem>
                {JOB_STATUSES.filter(s => s.value !== "ISSUED").map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!checking && (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New job
            </Button>
          )}
        </div>
      </ToolbarCard>

      {!checking && (
        <p className="text-xs text-t3 px-0.5">
          Active design work items and site visits / surveys. Idle parent projects stay out of this list — search finds them below.
        </p>
      )}

      {matchingParents.length > 0 && (
        <div className="rounded-xl border border-bd bg-pg/40 px-4 py-3">
          <p className="type-label text-t3 mb-2">Projects</p>
          <ul className="space-y-1.5">
            {matchingParents.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  className="text-sm text-left w-full hover:text-ac transition-colors"
                  onClick={() => router.push(`/jobs/${p.id}`)}
                >
                  <span className="font-mono font-medium text-ac">{p.drawingNumber}</span>
                  <span className="text-t3"> · {p.clientCompany}</span>
                  {p.siteName ? <span className="text-t4"> · {p.siteName}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DataPanel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bd bg-surface-low">
                <th className="px-4 py-2.5 text-left type-label text-t3">Drawing / Ref</th>
                <th className="px-4 py-2.5 text-left type-label text-t3">Work</th>
                <th className="px-4 py-2.5 text-left type-label text-t3 hidden sm:table-cell">Client</th>
                <th className="px-4 py-2.5 text-left type-label text-t3 hidden md:table-cell">Site</th>
                <th className="px-4 py-2.5 text-left type-label text-t3">Status</th>
                <th className="px-4 py-2.5 text-left type-label text-t3 hidden lg:table-cell">Designer</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !data && (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-bd">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3.5"><div className="skeleton h-4 w-24" /></td>
                    ))}
                  </tr>
                ))
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="inline-flex flex-col items-center gap-3">
                      <FolderOpen className="h-5 w-5 text-t4" />
                      <p className="text-sm font-medium text-t1">{checking ? "Nothing in checking" : "No active work"}</p>
                      {!checking && (
                        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                          <Plus className="h-3.5 w-3.5" /> New job
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {rows.map(row => {
                const dl = getJobDeadlineInfo({
                  status: row.status,
                  requiredByDate: row.requiredByDate,
                } as never)
                return (
                  <tr
                    key={`${row.kind}:${row.id}`}
                    className={cn(
                      "border-b border-bd cursor-pointer hover:bg-pg/80 transition-colors",
                      JOB_ROW_BG[row.status] ?? "",
                      JOB_ROW_BORDER[row.status] ?? "",
                    )}
                    onClick={() => router.push(`/jobs/${row.parentJobId}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono type-badge text-ac">{row.drawingNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-t1 flex-wrap">
                        {row.workType === "REVISION" && <GitBranch className="h-3.5 w-3.5 text-ac" />}
                        {row.kind === "job" && row.itemType !== "DESIGN" && (
                          <WorkItemTypeBadge itemType={row.itemType} size="sm" />
                        )}
                        {row.workLabel}
                      </span>
                      {dl.severity !== "none" && (
                        <p className="type-helper text-t3 mt-0.5">{dl.label}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-t2 truncate max-w-[160px]">
                      {row.clientCompany}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-t3 truncate max-w-[180px]">
                      {row.siteName || row.address}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <InlineStatusSelect
                        status={row.status}
                        onChange={value => void patchField(row, { status: value })}
                      />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-t2 truncate max-w-[140px]">
                      {row.designer || <span className="text-t4 italic">Unassigned</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <TablePagination
          variant="inset"
          page={page}
          totalPages={pages}
          onPageChange={setPage}
          countLabel={`${total} active`}
        />
      </DataPanel>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New job</DialogTitle>
            <DialogDescription>
              Create a design, site visit, or CAT III check. Design jobs open as a parent job with an original issue.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <JobForm key={createOpen ? "open" : "closed"} formId="create-parent-job-form" onSubmit={handleCreate} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancel</Button>
            <Button type="submit" form="create-parent-job-form" variant="primary" loading={createSaving} disabled={createSaving}>
              {createSaving ? "Creating…" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
