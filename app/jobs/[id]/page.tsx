"use client"
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { format } from "date-fns"
import dynamic from "next/dynamic"
import { Pencil, Trash2, FileText, UserPlus, GitBranch, Clock, AlertOctagon } from "lucide-react"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/components/ui/dialog"
import { StatusBadge }        from "@/components/status-badge"
import { WorkItemTypeBadge }  from "@/components/work-item-type-badge"
import { StatusWorkflow }     from "@/components/status-workflow"
import { useToast }            from "@/components/ui/toast"
import { formatGBP, getJobDeadlineInfo, deadlineBadgeClass, parseLocalDate, totalJobCommercialValue } from "@/lib/utils"
import { useUser }             from "@/components/user-context"
import { PageShell, DetailPanel, BackLink, PageHeader } from "@/components/page-layout"
import { OTHER_WORKS_TYPE }    from "@/lib/constants"
import type { Job, JobFormData, BillingHandoff } from "@/lib/types"

const AssignDesignerModal = dynamic(
  () => import("@/components/assign-designer-modal").then(m => m.AssignDesignerModal),
  { ssr: false },
)
const StatusHistory = dynamic(
  () => import("@/components/status-history").then(m => m.StatusHistory),
  { ssr: false },
)
const RevisionsPanel = dynamic(
  () => import("@/components/revisions-panel").then(m => m.RevisionsPanel),
  { ssr: false },
)
const JobForm = dynamic(
  () => import("@/components/job-form").then(m => m.JobForm),
  { ssr: false },
)

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-24 skeleton rounded" />
      <div className="h-7 w-80 skeleton rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-32 skeleton rounded" />
          <div className="h-48 skeleton rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-20 skeleton rounded" />
          <div className="h-24 skeleton rounded" />
        </div>
      </div>
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

export default function JobDetailPage() {
  const params = useParams()
  const id     = params.id as string
  const router = useRouter()
  const { toast }    = useToast()
  const { userName, isAdmin } = useUser()

  const [job,        setJob]        = useState<Job | null>(null)
  const [parentJob,  setParentJob]  = useState<Job | null>(null)  // if this is a revision
  const [billingHandoff, setBillingHandoff] = useState<BillingHandoff | null>(null)
  const [loading,    setLoading]    = useState(true)
  const hasData      = useRef(false)
  const [notFound,   setNotFound]   = useState(false)
  const [editOpen,   setEditOpen]   = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [delOpen,    setDelOpen]    = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [dnEditOpen,   setDnEditOpen]   = useState(false)
  const [dnEditValue,  setDnEditValue]  = useState("")
  const [dnEditSaving, setDnEditSaving] = useState(false)

  const load = async () => {
    if (!hasData.current) setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) throw new Error()
      const loaded = await res.json() as Job
      setJob(loaded)
      hasData.current = true

      // Parent job + billing handoff in parallel after main job is known.
      const [parentResult, billingResult] = await Promise.all([
        loaded.parentJobId
          ? fetch(`/api/jobs/${loaded.parentJobId}`).then(r => r.ok ? r.json() as Promise<Job> : null)
          : Promise.resolve(null),
        isAdmin
          ? fetch(`/api/billing-handoffs?sourceJobId=${loaded.id}`)
              .then(r => r.ok ? r.json() as Promise<{ handoff: BillingHandoff | null }> : null)
          : Promise.resolve(null),
      ])
      setParentJob(parentResult)
      setBillingHandoff(billingResult?.handoff ?? null)
    } catch { toast("Failed to load job", "error") }
    finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- load uses id/isAdmin from closure; re-running on id change is correct
  useEffect(() => { if (id) load() }, [id])

  const handleEdit = async (form: JobFormData) => {
    setEditSaving(true)
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, changedBy: userName }),
      })
      if (!res.ok) { toast("Failed to save", "error"); throw new Error() }
      toast("Saved", "success")
      setEditOpen(false)
      load(); setHistoryKey(k => k + 1)
    } finally { setEditSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" })
      if (!res.ok) { toast("Archive failed", "error"); return }
      toast("Job archived", "info")
      // If it was a revision, go back to the parent; otherwise to the jobs list
      router.push(parentJob ? `/jobs/${parentJob.id}` : "/jobs")
    } finally { setDeleting(false) }
  }

  if (loading) return <PageShell wide><Skeleton /></PageShell>

  if (notFound || !job) return (
    <PageShell wide className="flex flex-col items-center justify-center py-24 text-center">
      <FileText className="h-8 w-8 text-t4 mb-3" />
      <p className="text-sm font-medium text-t1 mb-1">Job not found</p>
      <p className="text-xs text-t3 mb-4">This job may have been deleted.</p>
      <Button variant="outline" onClick={() => router.push("/jobs")}>Back to jobs</Button>
    </PageShell>
  )

  const isRevision = job.parentJobId !== null

  return (
    <PageShell wide>
      {/* Back nav — goes to parent if revision, otherwise to jobs list */}
      {isRevision && parentJob ? (
        <BackLink href={`/jobs/${parentJob.id}`}>{parentJob.drawingNumber}</BackLink>
      ) : (
        <BackLink href="/jobs">All jobs</BackLink>
      )}

      {/* Revision breadcrumb — only on revisions */}
      {isRevision && parentJob && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-ac-bg rounded-md text-xs">
          <GitBranch className="h-3.5 w-3.5 text-ac shrink-0" />
          <span className="text-ach">
            Revision of{" "}
            <Link href={`/jobs/${parentJob.id}`} className="font-semibold font-mono hover:underline">
              {parentJob.drawingNumber}
            </Link>
            {" "}· {parentJob.address}
          </span>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title={job.address}
        description={
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-ac">{job.drawingNumber}</span>
            {isAdmin && (
              <button
                onClick={() => { setDnEditValue(job.drawingNumber); setDnEditOpen(true) }}
                className="text-t4 hover:text-ac"
                title="Edit drawing number"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            <WorkItemTypeBadge itemType={job.itemType ?? "DESIGN"} />
            <StatusBadge status={job.status} />
            {isRevision && (
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-ac-bg text-ach">
                Rev {job.revisionLetter}
              </span>
            )}
            {(() => {
              const dl = getJobDeadlineInfo(job)
              if (dl.severity === "none") return null
              const cls = deadlineBadgeClass(dl.severity)
              return (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border ${cls}`}>
                  {dl.severity === "overdue" && <AlertOctagon className="h-3 w-3" />}
                  {dl.severity !== "overdue" && <Clock className="h-3 w-3" />}
                  {dl.label}
                </span>
              )
            })()}
            <span className="text-t3">·</span>
            <span>{job.typeOfWorks === OTHER_WORKS_TYPE && job.customTypeDescription ? job.customTypeDescription : job.typeOfWorks} · {job.clientCompany}</span>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setDelOpen(true)} title="Delete">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <DetailPanel title="Status">
            <StatusWorkflow
              jobId={job.id} currentStatus={job.status}
              onStatusChange={s => { setJob({ ...job, status: s }); setHistoryKey(k => k + 1) }}
            />
          </DetailPanel>

          <DetailPanel title="Details">
            <InfoRow label="Type"          value={(() => { const t = job.itemType ?? "DESIGN"; return t.charAt(0) + t.slice(1).toLowerCase().replace("_", " ") })()} />
            <InfoRow label="Address"       value={job.address} />
            <InfoRow label="Type of works" value={
              job.typeOfWorks === OTHER_WORKS_TYPE
                ? `Other — ${job.customTypeDescription || "no description"}`
                : job.typeOfWorks
            } />
            {job.legacyTypeOfWorks && (
              <InfoRow label="Originally entered as" value={job.legacyTypeOfWorks} />
            )}
            <InfoRow label="Client"        value={job.clientCompany} />
            <InfoRow label="Requested by"  value={job.requestedBy} />
            <InfoRow label="Designer"      value={job.designer || undefined} />
            <InfoRow label="Created"       value={format(new Date(job.dateCreated), "d MMMM yyyy")} />
            {job.dateCompleted && (
              <InfoRow label="Completed" value={format(parseLocalDate(job.dateCompleted), "d MMMM yyyy")} />
            )}
            {job.requestedDate  && <InfoRow label="Requested date" value={format(parseLocalDate(job.requestedDate),  "d MMMM yyyy")} />}
            {job.requiredByDate && <InfoRow label="Required by"    value={format(parseLocalDate(job.requiredByDate), "d MMMM yyyy")} />}
            {job.notes && <InfoRow label="Notes" value={job.notes} />}
          </DetailPanel>

          {/* Commercial section — always shown, edit to populate */}
          <DetailPanel title="Commercial">
            {job.quoteValue != null || job.quoteReference || job.quoteDate || job.commercialNotes
              || job.variationFees != null || job.additionalCharges != null ? (
              <>
                {job.quoteValue != null && (
                  <InfoRow label="Quote value" value={formatGBP(job.quoteValue)} />
                )}
                {job.variationFees != null && (
                  <InfoRow label="Variation fees" value={formatGBP(job.variationFees)} />
                )}
                {job.additionalCharges != null && (
                  <InfoRow label="Additional charges" value={formatGBP(job.additionalCharges)} />
                )}
                {totalJobCommercialValue(job) != null && (
                  <InfoRow label="Total agreed" value={formatGBP(totalJobCommercialValue(job))} />
                )}
                {job.quoteReference && (
                  <InfoRow label="Quote reference" value={job.quoteReference} />
                )}
                {job.quoteDate && (
                  <InfoRow
                    label="Quote date"
                    value={format(parseLocalDate(job.quoteDate), "d MMMM yyyy")}
                  />
                )}
                {job.commercialNotes && (
                  <InfoRow label="Notes" value={job.commercialNotes} />
                )}
                {/* Revision inherit notice */}
                {isRevision && parentJob && job.quoteValue == null && parentJob.quoteValue != null && (
                  <div className="pt-2 mt-1 border-t border-bd">
                    <p className="text-xs text-t3">
                      Inherited from parent:{" "}
                      <span className="font-semibold text-t1">{formatGBP(parentJob.quoteValue)}</span>
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs text-t4 italic">No quote added yet.</p>
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-xs text-ac hover:text-ach font-medium"
                >
                  Add quote
                </button>
              </div>
            )}
            {/* Show inherited parent quote if this is a revision with no own quote */}
            {isRevision && parentJob && job.quoteValue == null && parentJob.quoteValue != null && (job.quoteReference || job.quoteDate || job.commercialNotes) === undefined && (
              <div className="mt-1">
                <p className="text-xs text-t3">
                  Inherited from parent:{" "}
                  <span className="font-semibold text-t1">{formatGBP(parentJob.quoteValue)}</span>
                </p>
              </div>
            )}
            {/* Ready For Invoicing status */}
            {billingHandoff && (
              <div className="pt-2 mt-2 border-t border-bd">
                <p className="text-xs text-t3 flex items-center gap-2">
                  <span className="text-t4">Invoicing</span>
                  {billingHandoff.clearedByAccountsAt ? (
                    <span className="font-medium text-ok-tx">Cleared by accounts{billingHandoff.clearedBy ? ` (${billingHandoff.clearedBy})` : ""}</span>
                  ) : (
                    <span className="font-medium text-wn-tx">Awaiting accounts action</span>
                  )}
                </p>
              </div>
            )}
          </DetailPanel>

          <DetailPanel title="Activity">
            <StatusHistory
              key={historyKey} jobId={job.id}
              onUpdate={() => setHistoryKey(k => k + 1)}
            />
          </DetailPanel>

          {/* Revision chain — original and revision detail pages */}
          <DetailPanel title={isRevision ? "Revision history" : "Revisions"}>
            <RevisionsPanel
              job={job}
              onRevisionCreated={() => {
                /* panel handles its own state; no page reload needed */
              }}
            />
          </DetailPanel>
        </div>

        <div className="space-y-3">
          <DetailPanel title="Timeline">
            <dl className="space-y-2">
              {([
                ["Created",  format(new Date(job.dateCreated), "d MMM yyyy")],
                        ...(job.dateCompleted ? [["Completed", format(parseLocalDate(job.dateCompleted), "d MMM yyyy")]] : []),
                ["Updated",  format(new Date(job.updatedAt), "d MMM yyyy")],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between text-xs">
                  <dt className="text-t3">{l}</dt>
                  <dd className="font-medium text-t1 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </DetailPanel>

          {/* Deadline card */}
          {job.requiredByDate && job.status !== "ISSUED" && (() => {
            const dl = getJobDeadlineInfo(job)
            return (
              <div className={`rounded-md border p-4 ${
                dl.severity === "overdue" ? "bg-dn-bg border-dn-bd" :
                dl.severity === "today"   ? "bg-wn-bg border-wn-bd" :
                dl.severity === "soon"    ? "bg-wn-bg/60 border-wn-bd/60" :
                "bg-sr border-bd"
              }`}>
                <div className="flex items-center gap-1.5 mb-2">
                  {dl.severity === "overdue" ? <AlertOctagon className="h-4 w-4 text-dn shrink-0" /> :
                   dl.severity === "today"   ? <Clock className="h-4 w-4 text-wn shrink-0" /> :
                   <Clock className="h-4 w-4 text-t4 shrink-0" />}
                  <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Deadline</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${
                  dl.severity === "overdue" ? "text-dn-tx" :
                  dl.severity === "today"   ? "text-wn-tx" :
                  dl.severity === "soon"    ? "text-wn-tx" :
                  "text-t1"
                }`}>{dl.label}</p>
                <p className="text-xs text-t3 mt-0.5">
                  {format(parseLocalDate(job.requiredByDate), "d MMM yyyy")}
                </p>
              </div>
            )
          })()}

          <DetailPanel title="Actions">
            <div className="space-y-1.5">
              {!job.designer && (
                <Button variant="primary" size="sm" className="w-full justify-start" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Assign designer
                </Button>
              )}
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </Button>
              <Button variant="ghost" size="sm"
                className="w-full justify-start text-dn hover:bg-dn-bg"
                onClick={() => setDelOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Archive job
              </Button>
            </div>
          </DetailPanel>
        </div>
      </div>

      {/* Assign designer */}
      <AssignDesignerModal
        job={assignOpen ? job : null}
        onClose={() => setAssignOpen(false)}
        onSaved={updated => {
          setJob(updated)
          setAssignOpen(false)
          setHistoryKey(k => k + 1)
        }}
      />

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={o => { if (!o && !editSaving) setEditOpen(false) }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
            <DialogDescription>
              {isRevision ? `Revision ${job.revisionLetter} of ${parentJob?.drawingNumber}` : "Update job details and status."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <JobForm
              key={editOpen ? `edit-${job.id}` : "closed"}
              formId="detail-edit-form"
              job={job} onSubmit={handleEdit}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button type="submit" form="detail-edit-form" variant="primary" loading={editSaving} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive dialog */}
      <Dialog open={delOpen} onOpenChange={o => { if (!o && !deleting) setDelOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Archive {isRevision ? "revision" : "job"}</DialogTitle>
            <DialogDescription>
              Archive{" "}
              <span className="font-mono font-semibold text-ac">{job.drawingNumber}</span>?
              The {isRevision ? "revision" : "job"} will be hidden from active views but can be restored later from the Archived Items page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelOpen(false)} disabled={deleting}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting} disabled={deleting}>
              {deleting ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing number edit dialog — admin only */}
      <Dialog open={dnEditOpen} onOpenChange={o => { if (!o && !dnEditSaving) setDnEditOpen(false) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit drawing number</DialogTitle>
            <DialogDescription>
              Current: <span className="font-mono font-semibold">{job.drawingNumber}</span>. The sequence counter will be updated automatically to prevent future duplicates.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              value={dnEditValue}
              onChange={e => setDnEditValue(e.target.value)}
              placeholder="e.g. 26/ORYX/06/001"
              className="font-mono"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDnEditOpen(false)} disabled={dnEditSaving}>Cancel</Button>
            <Button
              variant="primary"
              loading={dnEditSaving}
              disabled={dnEditSaving || !dnEditValue.trim() || dnEditValue.trim() === job.drawingNumber}
              onClick={async () => {
                setDnEditSaving(true)
                try {
                  const res = await fetch(`/api/jobs/${id}/drawing-number`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ drawingNumber: dnEditValue.trim() }),
                  })
                  const data = await res.json() as Job & { error?: string }
                  if (!res.ok) { toast(data.error ?? "Failed to update", "error"); return }
                  setJob(data)
                  setDnEditOpen(false)
                  setHistoryKey(k => k + 1)
                  toast("Drawing number updated", "success")
                } catch { toast("Network error", "error") }
                finally { setDnEditSaving(false) }
              }}
            >
              {dnEditSaving ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
