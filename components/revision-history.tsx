"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { GitBranch, ChevronDown, ChevronUp, Loader2, Plus, UserCircle2, PenTool, Receipt, Check } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import { StatusBadge } from "@/components/status-badge"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { revisionParentId } from "@/lib/revision-chain"
import { REVISIONS_CHANGED, notifyRevisionsChanged } from "@/lib/revision-events"
import { cn } from "@/shared/utils/utils"
import { ListSkeleton } from "@/shared/ui/list-skeleton"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse, RevisionHistoryEntry } from "@/modules/jobs/types/revision-types"

interface Props {
  job: Job
  refreshKey?: number
  defaultOpen?: boolean
  /** When true, skip the outer card/header (used inside a tab panel). */
  embedded?: boolean
  onFamilyChanged?: () => void
}

function formatHistoryDate(iso: string): string {
  return format(new Date(iso), "dd/MM/yyyy")
}

function TimelineEntry({
  entry,
  isLast,
  isAdmin,
  onToggleBillable,
  togglingId,
}: {
  entry: RevisionHistoryEntry
  isLast: boolean
  isAdmin: boolean
  onToggleBillable?: (entry: RevisionHistoryEntry, billable: boolean) => void
  togglingId?: string | null
}) {
  return (
    <div
      className={cn("relative flex gap-4 sm:gap-5", !isLast && "pb-6")}
      aria-current={entry.isCurrent ? "true" : undefined}
    >
      {!isLast && (
        <div className="absolute left-[10px] top-6 bottom-0 w-px bg-bd" aria-hidden />
      )}

      <div
        className={cn(
          "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center border mt-0.5",
          entry.isCurrent
            ? "border-ac bg-ac text-on-ac"
            : "border-ac bg-sr",
        )}
      >
        {entry.isCurrent ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        ) : (
          <div className="h-2 w-2 bg-ac" />
        )}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 rounded-lg border p-4",
          entry.isCurrent ? "border-ac bg-ac-bg/40" : "border-bd bg-sr",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-1.5">
          <h4 className={cn(
            "type-body-lg tracking-tight",
            entry.isCurrent ? "text-ac" : "text-t1",
          )}>
            {entry.title}
          </h4>
          {entry.isCurrent && (
            <span className="type-badge px-2 py-0.5 rounded-sm bg-ac text-on-ac">
              Current
            </span>
          )}
          <StatusBadge status={entry.status} />
          {entry.billable ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-sm bg-ok-bg text-ok-tx border border-ok-bd ">
              <Receipt className="h-3.5 w-3.5" /> Billable
            </span>
          ) : !entry.isOriginal ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-sm bg-pg text-t3 border border-bd ">
              Included
            </span>
          ) : null}
        </div>

        <p className="text-sm text-t3 tabular-nums mb-2.5">
          Created {formatHistoryDate(entry.dateCreated)}
        </p>

        <div className="space-y-1.5 text-sm text-t2">
          {entry.designer && (
            <p className="flex items-center gap-1.5">
              <PenTool className="h-3.5 w-3.5 text-t4 shrink-0" />
              <span className="text-t3 text-sm">Designer</span>
              <span className="font-semibold text-t1">{entry.designer}</span>
            </p>
          )}
          {entry.issuedBy && (
            <p className="flex items-center gap-1.5 flex-wrap">
              <UserCircle2 className="h-3.5 w-3.5 text-t4 shrink-0" />
              <span className="text-t3 text-sm">Issued by</span>
              <span className="font-semibold text-t1">{entry.issuedBy}</span>
              {entry.issuedAt && (
                <span className="text-t4 tabular-nums text-sm">
                  ({formatHistoryDate(entry.issuedAt)})
                </span>
              )}
            </p>
          )}
          {entry.notes ? (
            <div className="pt-2 mt-1 rounded-md border border-bd bg-surface-low px-3.5 py-2.5">
              <p className="text-sm font-semibold text-t3 mb-1">
                Reason for revision
              </p>
              <p className="text-base text-t1 leading-relaxed whitespace-pre-wrap">
                {entry.notes}
              </p>
            </div>
          ) : entry.isOriginal ? null : (
            <p className="text-t4 italic text-sm">No reason recorded</p>
          )}
        </div>

        {isAdmin && !entry.isOriginal && onToggleBillable && (
          <div className="mt-3 pt-2 border-t border-bd/60">
            <label className="inline-flex items-center gap-2 text-sm text-t2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-bd"
                checked={entry.billable}
                disabled={togglingId === entry.id}
                onChange={e => onToggleBillable(entry, e.target.checked)}
              />
              Chargeable / billable variation
            </label>
            <p className="text-xs text-t4 mt-1">
              Only billable revisions appear in Ready for Invoicing when Complete.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function RevisionHistory({ job, refreshKey = 0, defaultOpen = true, embedded = false, onFamilyChanged }: Props) {
  const { toast } = useToast()
  const { isAdmin } = useUser()

  const [family, setFamily] = useState<RevisionFamilyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(defaultOpen)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState("")
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const parentId = revisionParentId(job)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`, { cache: "no-store" })
      if (!res.ok) return
      const data = await res.json() as RevisionFamilyResponse
      setFamily(data)
    } finally {
      setLoading(false)
    }
  }, [job.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load, refreshKey])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load()
    }
    const onRevisionsChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ parentJobId: string }>).detail
      if (detail?.parentJobId === parentId) load()
    }

    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener(REVISIONS_CHANGED, onRevisionsChanged)
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener(REVISIONS_CHANGED, onRevisionsChanged)
    }
  }, [load, parentId])

  const createFromId =
    family?.chain.find(c => c.isCurrent)?.id
    ?? family?.revisions.at(-1)?.id
    ?? job.id

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const reason = notes.trim()
    if (reason.length < 3) {
      toast("Please explain why this revision is needed", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${createFromId}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reason, description: reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to create revision", "error")
        return
      }
      const revision = await res.json() as Job
      await load()
      setNotes("")
      setAdding(false)
      toast(`Revision ${revision.revisionLetter} created`, "success")
      notifyRevisionsChanged(parentId)
      onFamilyChanged?.()
    } catch {
      toast("Network error", "error")
    } finally {
      setSaving(false)
    }
  }

  const handleToggleBillable = async (entry: RevisionHistoryEntry, billable: boolean) => {
    setTogglingId(entry.id)
    try {
      const res = await fetch(`/api/jobs/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billable }),
      })
      if (!res.ok) {
        toast("Failed to update billable flag", "error")
        return
      }
      await load()
      toast(billable ? "Marked as billable" : "Marked as included (not billed)", "success")
      onFamilyChanged?.()
    } catch {
      toast("Network error", "error")
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return (
      <ListSkeleton rows={3} className="mb-4 space-y-2 rounded-xl border border-bd bg-pg p-4" />
    )
  }

  if (!family) {
    return (
      <div className="mb-4 rounded-xl border border-bd bg-pg px-5 py-4 text-sm text-t4">
        Could not load revision history.
      </div>
    )
  }

  const hasRevisions = family.revisions.length > 0
  const chain = family.chain
  const baseDrawing = family.baseDrawingNumber

  const body = (
        <div className={embedded ? "" : "px-5 py-6 sm:px-6"}>
          {!hasRevisions ? (
            <p className="text-base text-t4 italic mb-4">No previous revisions.</p>
          ) : (
            <div className="mb-5">
              {chain.map((entry, index) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  isLast={index === chain.length - 1}
                  isAdmin={isAdmin}
                  onToggleBillable={handleToggleBillable}
                  togglingId={togglingId}
                />
              ))}
            </div>
          )}

          {family.canAddRevision && (
            adding ? (
              <form onSubmit={handleCreate} className="border border-bd rounded-xl p-5 bg-pg space-y-3">
                <p className="text-base font-semibold text-t1">
                  Create Revision {family.nextRevisionLetter}
                  <span className="text-t4 font-normal ml-2 text-sm">
                    → {baseDrawing} Rev {family.nextRevisionLetter}
                  </span>
                </p>
                <p className="text-sm text-t3">
                  The parent job stays the same. This becomes the current revision (status starts as New Request). Not billable by default — mark Chargeable if it should invoice separately.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>
                    Reason for revision<span className="text-dn ml-0.5">*</span>
                  </Label>
                  <p className="type-helper text-t4">
                    What did the client request? Shown on the project timeline.
                  </p>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Client phoned — change bay spacing and add loading calcs"
                    rows={3}
                    autoFocus
                    required
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={saving}
                    disabled={saving || notes.trim().length < 3}
                  >
                    {saving ? "Creating…" : `Create Rev ${family.nextRevisionLetter}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setAdding(false); setNotes("") }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                Add revision{family.nextRevisionLetter ? ` ${family.nextRevisionLetter}` : ""}
              </Button>
            )
          )}
        </div>
  )

  if (embedded) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-t1 inline-flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-ac" />
              Revision Timeline
            </h2>
            <p className="text-sm text-t3 font-mono mt-0.5">{baseDrawing}</p>
          </div>
          {hasRevisions && (
            <span className="text-sm font-semibold text-t3 tabular-nums shrink-0">
              {family.revisions.length} revision{family.revisions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {body}
      </div>
    )
  }

  return (
    <section className="oryx-surface-card mb-0 overflow-hidden rounded-xl border border-bd bg-sr shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-3 border-b border-bd bg-pg/30 px-5 py-4 text-left transition-colors hover:bg-surface-low"
        aria-expanded={open}
      >
        <GitBranch className="h-5 w-5 text-ac shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-t1">Revision Timeline</p>
          <p className="text-sm text-t3 font-mono truncate mt-0.5">{baseDrawing}</p>
        </div>
        {hasRevisions && (
          <span className="text-sm font-semibold text-t3 tabular-nums shrink-0">
            {family.revisions.length} revision{family.revisions.length === 1 ? "" : "s"}
          </span>
        )}
        {open
          ? <ChevronUp className="h-5 w-5 text-t4 shrink-0" />
          : <ChevronDown className="h-5 w-5 text-t4 shrink-0" />}
      </button>

      {open && body}
    </section>
  )
}
