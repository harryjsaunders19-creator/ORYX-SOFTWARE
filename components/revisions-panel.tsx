"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { format } from "date-fns"
import { Plus, Loader2, ArrowRight } from "lucide-react"
import { Button }   from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label }    from "@/components/ui/label"
import { StatusBadge } from "@/components/status-badge"
import { useToast } from "@/components/ui/toast"
import { nextRevisionLetter } from "@/lib/constants"
import { revisionParentId } from "@/lib/revision-chain"
import { REVISIONS_CHANGED, notifyRevisionsChanged } from "@/lib/revision-events"
import type { Job } from "@/lib/types"

interface Props {
  /** Current job page — original or any revision in the chain */
  job: Job
  onRevisionCreated?: (revision: Job) => void
}

export function RevisionsPanel({ job, onRevisionCreated }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const { toast }    = useToast()

  const [revisions, setRevisions] = useState<Job[]>([])
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [notes,     setNotes]     = useState("")

  const parentId = revisionParentId(job)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`, { cache: "no-store" })
      if (!res.ok) return
      const { revisions: revs } = await res.json() as { revisions: Job[] }
      setRevisions(revs)
    } finally {
      setLoading(false)
    }
  }, [job.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load, pathname])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load()
    }
    const onPageshow = (e: PageTransitionEvent) => {
      if (e.persisted) load()
    }
    const onRevisionsChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ parentJobId: string }>).detail
      if (detail?.parentJobId === parentId) load()
    }

    window.addEventListener("focus", load)
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("pageshow", onPageshow)
    window.addEventListener(REVISIONS_CHANGED, onRevisionsChanged)

    return () => {
      window.removeEventListener("focus", load)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("pageshow", onPageshow)
      window.removeEventListener(REVISIONS_CHANGED, onRevisionsChanged)
    }
  }, [load, parentId])

  const latestRev = revisions.at(-1) ?? null
  const canAdd = revisions.length === 0
    ? job.parentJobId === null
    : job.id === latestRev?.id
  const nextLetter = nextRevisionLetter(revisions.map(r => r.revisionLetter ?? ""))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const reason = notes.trim()
    if (reason.length < 3) {
      toast("Please explain why this revision is needed", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ notes: reason, description: reason }),
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
      toast(`Revision ${revision.revisionLetter} created — ${revision.drawingNumber}`, "success")
      notifyRevisionsChanged(parentId)
      onRevisionCreated?.(revision)
    } catch { toast("Network error", "error") }
    finally  { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-t4">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  const baseDrawing = job.drawingNumber.replace(/ Rev [A-Z]$/, "")
  const isOriginal = job.parentJobId === null

  return (
    <div className="space-y-3">
      {revisions.length === 0 ? (
        <p className="text-xs text-t4 italic">No revisions yet.</p>
      ) : (
        <div className="border border-bd rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-low border-b border-bd">
                <th className="px-3 py-2 text-left font-semibold text-t3 w-6">Rev</th>
                <th className="px-3 py-2 text-left font-semibold text-t3">Drawing number</th>
                <th className="px-3 py-2 text-left font-semibold text-t3">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-t3">Designer</th>
                <th className="px-3 py-2 text-left font-semibold text-t3">Created</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {isOriginal && (
                <tr
                  className={`cursor-pointer hover:bg-pg ${job.id !== latestRev?.id ? "bg-pg/40" : ""}`}
                  onClick={() => router.push(`/jobs/${job.id}`)}
                >
                  <td className="px-3 py-2.5 font-semibold text-t3 whitespace-nowrap">—</td>
                  <td className="px-3 py-2.5 font-mono text-t2 whitespace-nowrap font-semibold">
                    {job.drawingNumber}
                    <span className="ml-1.5 type-badge text-t4 normal-case">Original</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-3 py-2.5 text-t2 whitespace-nowrap">
                    {job.designer || <span className="text-t4 italic">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2.5 text-t3 whitespace-nowrap tabular-nums">
                    {format(new Date(job.dateCreated), "d MMM yyyy")}
                  </td>
                  <td className="px-3 py-2.5 text-t4">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </td>
                </tr>
              )}
              {revisions.map(rev => {
                const isLatest = rev.id === latestRev?.id
                return (
                  <tr
                    key={rev.id}
                    className={`cursor-pointer hover:bg-pg ${isLatest ? "bg-ac-bg/50" : ""}`}
                    onClick={() => router.push(`/jobs/${rev.id}`)}
                  >
                    <td className="px-3 py-2.5 font-semibold text-t1 whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        {rev.revisionLetter}
                        {isLatest && (
                          <span className="bg-ac-bg text-ac rounded-full px-2 type-badge leading-tight">
                            Latest
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-ac whitespace-nowrap font-semibold">
                      {rev.drawingNumber}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <StatusBadge status={rev.status} />
                    </td>
                    <td className="px-3 py-2.5 text-t2 whitespace-nowrap">
                      {rev.designer || <span className="text-t4 italic">Unassigned</span>}
                    </td>
                    <td className="px-3 py-2.5 text-t3 whitespace-nowrap tabular-nums">
                      {format(new Date(rev.dateCreated), "d MMM yyyy")}
                    </td>
                    <td className="px-3 py-2.5 text-t4">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!canAdd && latestRev && (
        <p className="text-xs text-t3">
          To add Rev {nextLetter}, open{" "}
          <Link href={`/jobs/${latestRev.id}`} className="text-ac hover:text-ach font-mono font-semibold">
            {latestRev.drawingNumber}
          </Link>{" "}
          and click Add revision.
        </p>
      )}

      {canAdd && (adding ? (
        <form onSubmit={handleCreate} className="border border-bd rounded-md p-4 bg-pg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-t1">
              Create Revision {nextLetter}
              <span className="text-t4 font-normal ml-2">
                → {baseDrawing} Rev {nextLetter}
              </span>
            </p>
          </div>
          <div className="text-xs text-t3 bg-sr border border-bd rounded-md p-3 space-y-1">
            <p>The revision will be created as a new job with:</p>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              <li>Status: <strong>New Request</strong></li>
              <li>Designer: <strong>Unassigned</strong></li>
              <li>Same site, client, and type of works as the original</li>
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              Reason for revision<span className="text-dn ml-0.5">*</span>
            </Label>
            <p className="type-helper text-t4">
              What did the client request? Shown on the revision history.
            </p>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Client requested changes to bay spacing and loading calculations"
              rows={3} autoFocus required
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={saving || notes.trim().length < 3}
            >
              {saving ? "Creating…" : `Create Rev ${nextLetter}`}
            </Button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => { setAdding(false); setNotes("") }} disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add revision{nextLetter ? ` ${nextLetter}` : ""}
        </Button>
      ))}
    </div>
  )
}
