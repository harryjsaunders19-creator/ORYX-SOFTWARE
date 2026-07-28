"use client"
import { useEffect, useState } from "react"
import { formatDistanceToNow, format } from "date-fns"
import { ArrowRight, Plus, Loader2 } from "lucide-react"
import { getJobStatus }  from "@/lib/constants"
import { STATUS_DOT }    from "@/components/status-badge"
import { Button }        from "@/components/ui/button"
import { Textarea }      from "@/components/ui/textarea"
import { useToast }      from "@/components/ui/toast"
import { cn }            from "@/shared/utils"
import type { StatusHistoryEntry } from "@/lib/types"

export function StatusHistory({ jobId, onUpdate }: {
  jobId: string; onUpdate?: () => void
}) {
  const { toast }    = useToast()
  const [entries, setEntries]   = useState<StatusHistoryEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [addNote, setAddNote]   = useState(false)
  const [draft,   setDraft]     = useState("")
  const [saving,  setSaving]    = useState(false)

  const load = async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/history`)
      if (!res.ok) return
      const { history } = await res.json() as { history: StatusHistoryEntry[] }
      setEntries(history)
    } finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch when job changes
  useEffect(() => { load() }, [jobId])

  const submitNote = async () => {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/history`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft.trim() }),
      })
      if (!res.ok) throw new Error()
      setDraft(""); setAddNote(false)
      load(); onUpdate?.()
    } catch { toast("Failed to add note", "error") }
    finally  { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-4 text-t4">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  )

  return (
    <div>
      {entries.map((entry, i) => {
        const isFirst = i === 0
        const isLast  = i === entries.length - 1
        const isNote  = entry.fromStatus === entry.toStatus && !!entry.note

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Spine */}
            <div className="flex flex-col items-center w-4 shrink-0">
              <div className={cn("w-px flex-none", isFirst ? "h-2.5" : "h-2.5 bg-border")} />
              <div className={cn("w-2 h-2 rounded-full shrink-0", isNote ? "bg-t4" : (STATUS_DOT[entry.toStatus] ?? "bg-t4"))} />
              <div className={cn("w-px flex-1 min-h-[16px]", isLast ? "" : "bg-border")} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-3 mt-[-2px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {isNote ? (
                    <p className="text-sm text-t2">
                      <span className="font-medium text-t1">{entry.changedBy}</span> added a note
                    </p>
                  ) : entry.fromStatus ? (
                    <div className="flex items-center gap-1.5 flex-wrap text-sm text-t2">
                      <span className="font-medium text-t1">{entry.changedBy}</span>
                      <span className="text-t3">moved</span>
                      <span>{getJobStatus(entry.fromStatus).label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-t4" />
                      <span className="font-medium text-t1">{getJobStatus(entry.toStatus).label}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-t2">
                      <span className="font-medium text-t1">{entry.changedBy}</span>{" "}
                      created as <span className="font-medium text-t1">{getJobStatus(entry.toStatus).label}</span>
                    </p>
                  )}
                  {entry.note && <p className="text-sm text-t2 mt-1 leading-relaxed">{entry.note}</p>}
                </div>
                <time
                  dateTime={entry.changedAt}
                  title={format(new Date(entry.changedAt), "d MMM yyyy, HH:mm")}
                  className="text-sm text-t4 shrink-0 tabular-nums"
                >
                  {formatDistanceToNow(new Date(entry.changedAt), { addSuffix: true })}
                </time>
              </div>
            </div>
          </div>
        )
      })}

      {addNote ? (
        <div className="mt-1 space-y-2">
          <Textarea
            value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="Add a note…" rows={2} autoFocus
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNote()
              if (e.key === "Escape") { setAddNote(false); setDraft("") }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAddNote(false); setDraft("") }}>Cancel</Button>
            <Button variant="primary" size="sm" loading={saving} disabled={!draft.trim() || saving} onClick={submitNote}>
              Add note
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddNote(true)}
          className="flex items-center gap-1.5 text-sm text-t4 hover:text-t2 mt-2 focus:outline-none"
        >
          <Plus className="h-3.5 w-3.5" /> Add note
        </button>
      )}
    </div>
  )
}
