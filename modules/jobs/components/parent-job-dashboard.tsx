"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  GitBranch, Plus, Receipt, ChevronDown, ChevronUp, UserCircle2,
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { StatusBadge } from "@/components/status-badge"
import { StatusWorkflow } from "@/components/status-workflow"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { useApi } from "@/shared/hooks/use-api"
import { formatGBP, cn } from "@/shared/utils/utils"
import { PageShell, DetailPanel, BackLink, PageHeader } from "@/shared/layouts/page-layout"
import { DesignerCombobox } from "@/components/designer-combobox"
import type { ParentJobDashboard } from "@/modules/jobs/types/parent-dashboard-types"
import type { DesignWorkItemRow } from "@/modules/jobs/types/design-work-item-types"

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-24 skeleton rounded" />
      <div className="h-7 w-80 skeleton rounded" />
      <div className="h-40 skeleton rounded mt-4" />
      <div className="h-64 skeleton rounded" />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-bd last:border-0">
      <p className="text-xs font-medium text-t3">{label}</p>
      <p className="col-span-2 text-sm text-t1">
        {value ?? <span className="text-t4 italic">Not set</span>}
      </p>
    </div>
  )
}

function invoiceLabel(status: string): string {
  switch (status) {
    case "INVOICED": return "Invoiced"
    case "READY": return "Awaiting invoice"
    case "WRITTEN_OFF": return "Written off"
    default: return "—"
  }
}

export default function ParentJobDashboardPage({
  parentId,
  fallback,
}: {
  parentId: string
  fallback?: ParentJobDashboard | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const { isAdmin } = useUser()

  const { data, error, isLoading, mutate } = useApi<ParentJobDashboard>(
    parentId ? `/api/parent-jobs/${parentId}` : null,
    { fallbackData: fallback ?? undefined },
  )

  const [timelineOpen, setTimelineOpen] = useState(true)
  const [revOpen, setRevOpen] = useState(false)
  const [revSaving, setRevSaving] = useState(false)
  const [description, setDescription] = useState("")
  const [descError, setDescError] = useState<string | null>(null)
  const [billable, setBillable] = useState(false)
  const [designer, setDesigner] = useState("")
  const [priority, setPriority] = useState("")
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const parent = data?.parent
  const workItems = data?.workItems ?? []
  const current = data?.currentActive

  const sortedItems = useMemo(
    () => [...workItems].sort((a, b) => a.dateCreated.localeCompare(b.dateCreated)),
    [workItems],
  )

  const createRevision = async () => {
    const reason = description.trim()
    if (reason.length < 3) {
      setDescError("Please explain why this revision is needed (at least 3 characters).")
      return
    }
    setDescError(null)
    setRevSaving(true)
    try {
      const res = await fetch(`/api/parent-jobs/${parentId}/work-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: reason,
          notes: reason,
          billable,
          designer,
          priority: priority || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast(err.error ?? "Failed to create revision", "error")
        return
      }
      toast("Revision created", "success")
      setRevOpen(false)
      setDescription("")
      setBillable(false)
      setDesigner("")
      setPriority("")
      await mutate()
    } finally {
      setRevSaving(false)
    }
  }

  const patchWorkItem = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/work-items/${id}`, {
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

  const toggleBillable = async (item: DesignWorkItemRow, next: boolean) => {
    setTogglingId(item.id)
    try {
      await patchWorkItem(item.id, { billable: next })
    } finally {
      setTogglingId(null)
    }
  }

  if (isLoading && !data) {
    return <PageShell wide><Skeleton /></PageShell>
  }

  if (error || !parent) {
    return (
      <PageShell wide className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-t1 mb-1">Project not found</p>
        <p className="text-xs text-t3 mb-4">This parent job may not exist yet or has not been migrated.</p>
        <Button variant="outline" onClick={() => router.push("/jobs")}>Back to jobs</Button>
      </PageShell>
    )
  }

  const summary = data.invoiceSummary

  return (
    <PageShell wide>
      <BackLink href="/jobs">Active work</BackLink>

      <PageHeader
        title={parent.drawingNumber}
        description={parent.clientCompany}
        actions={
          data.canAddRevision ? (
            <Button variant="primary" size="sm" onClick={() => setRevOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Create Revision
              {data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </Button>
          ) : null
        }
      />

      {/* Project summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <DetailPanel title="Project" className="lg:col-span-2">
          <InfoRow label="Drawing" value={parent.drawingNumber} />
          <InfoRow label="Client" value={parent.clientCompany} />
          <InfoRow label="Site" value={parent.siteName || parent.address} />
          <InfoRow label="Address" value={parent.siteAddress || parent.address} />
          <InfoRow label="Type of works" value={parent.typeOfWorks} />
          <InfoRow label="Requested by" value={parent.requestedBy} />
          <InfoRow
            label="Current active"
            value={current ? current.title : "None — waiting for next revision"}
          />
          <InfoRow
            label="Revisions"
            value={`${data.revisionCount} revision${data.revisionCount === 1 ? "" : "s"} · ${workItems.length} work item${workItems.length === 1 ? "" : "s"}`}
          />
          <InfoRow
            label="Last updated"
            value={format(new Date(parent.updatedAt), "d MMM yyyy HH:mm")}
          />
        </DetailPanel>

        <div className="space-y-4">
          <DetailPanel title="Invoice summary">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-t3">Quoted total</span>
                <span className="font-medium tabular-nums">{formatGBP(summary.quotedTotal) ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-t3">Billed</span>
                <span className="font-medium tabular-nums text-ok">{formatGBP(summary.billedTotal) ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-t3">Ready to invoice</span>
                <span className="font-medium tabular-nums">{formatGBP(summary.readyTotal) ?? "—"}</span>
              </div>
              <p className="text-xs text-t4 pt-2 border-t border-bd">
                {summary.invoicedCount} of {summary.itemCount} work items invoiced
              </p>
            </div>
          </DetailPanel>

          {current && (
            <DetailPanel title={`Active — ${current.title}`}>
              <div className="mb-3">
                <StatusBadge status={current.status} />
              </div>
              <StatusWorkflow
                jobId={current.id}
                currentStatus={current.status}
                onStatusChange={() => void mutate()}
                patchUrl={`/api/work-items/${current.id}`}
              />
              <div className="mt-3">
                <Label className="text-xs text-t3">Designer</Label>
                <div className="mt-1">
                  <DesignerCombobox
                    value={current.designer}
                    onChange={v => void patchWorkItem(current.id, { designer: v })}
                  />
                </div>
              </div>
            </DetailPanel>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 rounded-xl border border-bd bg-sr shadow-card overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 border-b border-bd hover:bg-pg/60 transition-colors"
          onClick={() => setTimelineOpen(o => !o)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-t1">
            <GitBranch className="h-4 w-4 text-ac" />
            Work history
          </span>
          {timelineOpen ? <ChevronUp className="h-4 w-4 text-t3" /> : <ChevronDown className="h-4 w-4 text-t3" />}
        </button>

        {timelineOpen && (
          <div className="p-4 sm:p-5 space-y-0">
            {sortedItems.map((item, idx) => {
              const isCurrent = current?.id === item.id
              const isLast = idx === sortedItems.length - 1
              return (
                <div key={item.id} className={cn("relative flex gap-3 sm:gap-4", !isLast && "pb-4")}>
                  <div className="flex flex-col items-center shrink-0 w-5">
                    <div className={cn(
                      "h-3 w-3 rounded-full border-2 mt-1.5",
                      isCurrent ? "border-ac bg-ac" : "border-t3 bg-sr",
                    )} />
                    {!isLast && <div className="w-px flex-1 bg-bd mt-1.5 min-h-[20px]" />}
                  </div>
                  <div className={cn(
                    "flex-1 min-w-0 rounded-xl border p-3",
                    isCurrent ? "border-ac bg-ac-bg/50" : "border-bd bg-pg/40",
                  )}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-t1">{item.title}</h4>
                      {isCurrent && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-ac text-on-ac">
                          Active
                        </span>
                      )}
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-t3">
                      <p className="inline-flex items-center gap-1">
                        <UserCircle2 className="h-3 w-3" />
                        {item.designer || "Unassigned"}
                      </p>
                      <p>
                        Created {format(new Date(item.dateCreated), "d MMM yyyy")}
                      </p>
                      {item.completedAt && (
                        <p>Completed {format(new Date(item.completedAt), "d MMM yyyy")}</p>
                      )}
                      <p className="inline-flex items-center gap-1">
                        <Receipt className="h-3 w-3" />
                        {invoiceLabel(item.invoiceStatus)}
                        {item.invoiceNumber ? ` · ${item.invoiceNumber}` : ""}
                      </p>
                      {(item.quoteValue != null || item.billedValue != null) && (
                        <p className="tabular-nums">
                          {item.billedValue != null
                            ? `Billed ${formatGBP(item.billedValue)}`
                            : `Quoted ${formatGBP(item.quoteValue)}`}
                        </p>
                      )}
                    </div>
                    {item.workType === "REVISION" && (
                      <div className="mt-2 rounded-lg border border-bd bg-sr px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-0.5">
                          Reason for revision
                        </p>
                        {item.description || item.notes ? (
                          <p className="text-sm text-t1 whitespace-pre-wrap">
                            {item.description || item.notes}
                          </p>
                        ) : (
                          <p className="text-xs text-t4 italic">No reason recorded</p>
                        )}
                      </div>
                    )}
                    {item.workType === "ORIGINAL" && item.description && (
                      <p className="text-sm text-t2 mt-2 whitespace-pre-wrap">{item.description}</p>
                    )}
                    {isAdmin && item.workType === "REVISION" && (
                      <label className="mt-2 inline-flex items-center gap-2 text-xs text-t2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.billable}
                          disabled={togglingId === item.id}
                          onChange={e => void toggleBillable(item, e.target.checked)}
                        />
                        Chargeable (Ready for Invoicing when Complete)
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={revOpen} onOpenChange={o => {
        if (!revSaving) {
          setRevOpen(o)
          if (!o) {
            setDescription("")
            setDescError(null)
          }
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create Revision{data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </DialogTitle>
            <DialogDescription>
              Adds active work on {parent.drawingNumber}. The Parent Job stays the same — explain what the client asked for.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-lg border border-bd bg-pg px-3 py-2.5 text-xs text-t3 space-y-1">
              <p>
                New work item: <span className="font-semibold text-t1">Revision {data.nextRevisionLetter}</span>
              </p>
              <p>Starts as New Request. Mark Chargeable only if this revision should be invoiced separately.</p>
            </div>
            <div>
              <Label>
                Reason for revision<span className="text-dn ml-0.5">*</span>
              </Label>
              <p className="text-[11px] text-t4 mt-0.5 mb-1.5">
                What did the client request? This appears on the project timeline for the whole team.
              </p>
              <Textarea
                className={cn("mt-0", descError && "border-dn")}
                rows={4}
                value={description}
                onChange={e => {
                  setDescription(e.target.value)
                  if (descError) setDescError(null)
                }}
                placeholder="e.g. Client phoned — change bay spacing and add loading calcs on first floor"
                autoFocus
              />
              {descError && <p className="text-xs text-dn mt-1">{descError}</p>}
            </div>
            <div>
              <Label>Designer</Label>
              <div className="mt-1.5">
                <DesignerCombobox value={designer} onChange={setDesigner} />
              </div>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority || "__none"} onValueChange={v => setPriority(v === "__none" ? "" : v)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="NORMAL">Normal</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-t2">
              <input type="checkbox" checked={billable} onChange={e => setBillable(e.target.checked)} />
              Chargeable — bill this revision separately
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevOpen(false)} disabled={revSaving}>Cancel</Button>
            <Button
              variant="primary"
              loading={revSaving}
              disabled={!description.trim()}
              onClick={() => void createRevision()}
            >
              Create Revision{data.nextRevisionLetter ? ` ${data.nextRevisionLetter}` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
