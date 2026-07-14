"use client"
import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { GitBranch, ChevronDown, ChevronUp, Loader2, Plus, UserCircle2, PenTool, Receipt } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import { StatusBadge } from "@/components/status-badge"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { revisionParentId } from "@/lib/revision-chain"
import { REVISIONS_CHANGED, notifyRevisionsChanged } from "@/lib/revision-events"
import { cn } from "@/shared/utils/utils"
import type { Job } from "@/lib/types"
import type { RevisionFamilyResponse, RevisionHistoryEntry } from "@/modules/jobs/types/revision-types"

interface Props {
  job: Job
  refreshKey?: number
  defaultOpen?: boolean
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
      className={cn(
        "relative flex gap-3 sm:gap-4",
        !isLast && "pb-4 sm:pb-5",
      )}
      aria-current={entry.isCurrent ? "true" : undefined}
    >
      <div className="flex flex-col items-center shrink-0 w-5 sm:w-6">
        <div
          className={cn(
            "h-3 w-3 rounded-full border-2 shrink-0 mt-1.5",
            entry.isCurrent
              ? "border-ac bg-ac shadow-[0_0_0_3px] shadow-ac/20"
              : entry.isOriginal
                ? "border-t3 bg-sr"
                : "border-ac/50 bg-ac-bg",
          )}
        />
        {!isLast && <div className="w-px flex-1 bg-bd mt-1.5 min-h-[24px]" />}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 rounded-xl border p-3 sm:p-3.5",
          entry.isCurrent
            ? "border-ac bg-ac-bg/60 shadow-sm"
            : "border-bd bg-sr",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          <h4 className={cn(
            "text-sm font-semibold",
            entry.isCurrent ? "text-ac" : "text-t1",
          )}>
            {entry.title}
          </h4>
          {entry.isCurrent && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-ac text-on-ac">
              Current
            </span>
          )}
          <StatusBadge status={entry.status} />
          {entry.billable ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-ok-bg text-ok-tx border border-ok-bd">
              <Receipt className="h-2.5 w-2.5" /> Billable
            </span>
          ) : !entry.isOriginal ? (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-pg text-t3 border border-bd">
              Included
            </span>
          ) : null}
        </div>

        <p className="text-xs text-t3 tabular-nums mb-2">
          Created {formatHistoryDate(entry.dateCreated)}
        </p>

        <div className="space-y-1 text-xs text-t2">
          {entry.designer && (
            <p className="flex items-center gap-1.5">
              <PenTool className="h-3 w-3 text-t4 shrink-0" />
              <span className="text-t3">Designer</span>
              <span className="font-medium">{entry.designer}</span>
            </p>
          )}
          {entry.issuedBy && (
            <p className="flex items-center gap-1.5">
              <UserCircle2 className="h-3 w-3 text-t4 shrink-0" />
              <span className="text-t3">Issued by</span>
              <span className="font-medium">{entry.issuedBy}</span>
              {entry.issuedAt && (
                <span className="text-t4 tabular-nums">
                  ({formatHistoryDate(entry.issuedAt)})
                </span>
              )}
            </p>
          )}
          {entry.notes ? (
            <div className="pt-1.5 mt-1 rounded-md border border-bd bg-pg px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-t3 mb-0.5">
                Reason for revision
              </p>
              <p className="text-sm text-t1 leading-relaxed whitespace-pre-wrap">
                {entry.notes}
              </p>
            </div>
          ) : entry.isOriginal ? null : (
            <p className="text-t4 italic text-xs">No reason recorded</p>
          )}
        </div>

        {isAdmin && !entry.isOriginal && onToggleBillable && (
          <div className="mt-2.5 pt-2 border-t border-bd/60">
            <label className="inline-flex items-center gap-2 text-xs text-t2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-bd"
                checked={entry.billable}
                disabled={togglingId === entry.id}
                onChange={e => onToggleBillable(entry, e.target.checked)}
              />
              Chargeable / billable variation
            </label>
            <p className="text-[10px] text-t4 mt-1">
              Only billable revisions appear in Ready for Invoicing when Complete.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function RevisionHistory({ job, refreshKey = 0, defaultOpen = true, onFamilyChanged }: Props) {
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
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-bd bg-pg px-4 py-3 text-xs text-t4">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Loading revision history…
      </div>
    )
  }

  if (!family) {
    return (
      <div className="mb-4 rounded-xl border border-bd bg-pg px-4 py-3 text-xs text-t4">
        Could not load revision history.
      </div>
    )
  }

  const hasRevisions = family.revisions.length > 0
  const chain = family.chain
  const baseDrawing = family.baseDrawingNumber

  return (
    <section className="mb-4 rounded-xl border border-bd bg-sr shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 border-b border-bd bg-pg/60 text-left hover:bg-pg transition-colors"
        aria-expanded={open}
      >
        <GitBranch className="h-4 w-4 text-ac shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-t1">Revision History</p>
          <p className="text-[11px] text-t3 font-mono truncate mt-0.5">{baseDrawing}</p>
        </div>
        {hasRevisions && (
          <span className="text-[10px] font-semibold text-t3 tabular-nums shrink-0">
            {family.revisions.length} revision{family.revisions.length === 1 ? "" : "s"}
          </span>
        )}
        {open
          ? <ChevronUp className="h-4 w-4 text-t4 shrink-0" />
          : <ChevronDown className="h-4 w-4 text-t4 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          {!hasRevisions ? (
            <p className="text-sm text-t4 italic mb-4">No previous revisions.</p>
          ) : (
            <div className="mb-4">
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
              <form onSubmit={handleCreate} className="border border-bd rounded-xl p-4 bg-pg space-y-3">
                <p className="text-xs font-semibold text-t1">
                  Create Revision {family.nextRevisionLetter}
                  <span className="text-t4 font-normal ml-2">
                    → {baseDrawing} Rev {family.nextRevisionLetter}
                  </span>
                </p>
                <p className="text-[11px] text-t3">
                  The parent job stays the same. This becomes the current revision (status starts as New Request). Not billable by default — mark Chargeable if it should invoice separately.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>
                    Reason for revision<span className="text-dn ml-0.5">*</span>
                  </Label>
                  <p className="text-[11px] text-t4">
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
      )}
    </section>
  )
}
