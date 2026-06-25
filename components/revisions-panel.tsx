"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { Plus, Loader2, ArrowRight } from "lucide-react"
import { Button }   from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label }    from "@/components/ui/label"
import { StatusBadge } from "@/components/status-badge"
import { useUser }  from "@/components/user-context"
import { useToast } from "@/components/ui/toast"
import { nextRevisionLetter } from "@/lib/constants"
import type { Job } from "@/lib/types"

interface Props {
  /** The original (parent) job */
  job: Job
  /** Called after a revision is created, so the page can refresh */
  onRevisionCreated?: (revision: Job) => void
}

export function RevisionsPanel({ job, onRevisionCreated }: Props) {
  const router   = useRouter()
  const { userName } = useUser()
  const { toast }    = useToast()

  const [revisions, setRevisions] = useState<Job[]>([])
  const [loading,   setLoading]   = useState(true)
  const [adding,    setAdding]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [notes,     setNotes]     = useState("")

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`)
      if (!res.ok) return
      const { revisions: revs } = await res.json() as { revisions: Job[] }
      setRevisions(revs)
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch when job changes
  useEffect(() => { load() }, [job.id])

  const nextLetter = nextRevisionLetter(revisions.map(r => r.revisionLetter ?? ""))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/revisions`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ notes: notes.trim() || null, changedBy: userName }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to create revision", "error")
        return
      }
      const revision = await res.json() as Job
      setRevisions(prev => [...prev, revision])
      setNotes("")
      setAdding(false)
      toast(`Revision ${revision.revisionLetter} created — ${revision.drawingNumber}`, "success")
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

  return (
    <div className="space-y-3">
      {/* Revision history table */}
      {revisions.length === 0 ? (
        <p className="text-xs text-t4 italic">No revisions yet.</p>
      ) : (
        <div className="border border-bd rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-pg border-b border-bd">
                <th className="px-3 py-2 text-left font-semibold text-t3 uppercase tracking-wider w-6">Rev</th>
                <th className="px-3 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Drawing number</th>
                <th className="px-3 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Designer</th>
                <th className="px-3 py-2 text-left font-semibold text-t3 uppercase tracking-wider">Created</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bd">
              {revisions.map((rev, i) => {
                const isLatest = i === revisions.length - 1
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
                          <span className="bg-ac-bg text-ach rounded-full px-2 text-[10px] font-medium leading-tight">
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

      {/* Add revision */}
      {adding ? (
        <form onSubmit={handleCreate} className="border border-bd rounded-md p-4 bg-pg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-t1">
              Create Revision {nextLetter}
              <span className="text-t4 font-normal ml-2">
                → {job.drawingNumber} Rev {nextLetter}
              </span>
            </p>
          </div>
          <div className="text-xs text-t3 bg-sr border border-bd rounded-md p-3 space-y-1">
            <p>The revision will be created as a new job with:</p>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              <li>Status: <strong>New Request</strong></li>
              <li>Designer: <strong>Unassigned</strong></li>
              <li>Same site, client, and type of works as this job</li>
            </ul>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Client requested changes to bay spacing and loading calculations"
              rows={2} autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saving}>
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
        // Only allow revisions on original jobs (not on revisions of revisions)
        job.parentJobId === null && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create revision {revisions.length > 0 ? nextLetter : ""}
          </Button>
        )
      )}
    </div>
  )
}
