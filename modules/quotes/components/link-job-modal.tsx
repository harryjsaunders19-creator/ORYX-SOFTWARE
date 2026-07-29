"use client"
import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Search, Link2, Unlink } from "lucide-react"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { formatGBP } from "@/shared/utils/utils"
import type { Quote } from "@/lib/types"

interface JobSearchResult {
  id: string
  drawingNumber: string
  clientCompany: string
  address: string
  status: string
  quoteValue: number | null
}

export interface LinkJobModalProps {
  quote: Quote | null
  onClose: () => void
  onLinked: () => void
}

export function LinkJobModal({ quote, onClose, onLinked }: LinkJobModalProps) {
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 300)
  const [results, setResults] = useState<JobSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<JobSearchResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmReassign, setConfirmReassign] = useState(false)

  useEffect(() => {
    if (!quote) { setSearch(""); setResults([]); setSelected(null); setError(null); setConfirmReassign(false) }
  }, [quote])

  useEffect(() => {
    if (!debouncedSearch.trim() || !quote) { setResults([]); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/jobs?search=${encodeURIComponent(debouncedSearch)}&limit=10&page=1`)
      .then(r => r.json() as Promise<{ jobs: JobSearchResult[] }>)
      .then(d => { if (!cancelled) setResults(d.jobs ?? []) })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSearch, quote])

  const handleLink = async () => {
    if (!quote || !selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/link-job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selected.id, ...(confirmReassign && { confirmReassign: true }) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; requiresConfirmation?: boolean; currentJobId?: string }
        if (body.requiresConfirmation) {
          setConfirmReassign(true)
          setError(`This quote is already linked to job ${body.currentJobId}. Click again to move it to ${selected.drawingNumber}.`)
          return
        }
        setError(body.error ?? "Failed to link")
        return
      }
      onLinked()
      onClose()
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  const handleUnlink = async () => {
    if (!quote) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/link-job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? "Failed to unlink")
        return
      }
      onLinked()
      onClose()
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!quote} onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{quote?.jobId ? "Change linked job" : "Attach to existing job"}</DialogTitle>
          {quote && (
            <DialogDescription>
              Link <span className="type-drawing-number">{quote.quoteNumber}</span> to a job.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null); setConfirmReassign(false); setError(null) }}
                placeholder="Search jobs by number, client, address…"
                className="pl-10"
                autoFocus
              />
            </div>

            {loading && <p className="text-xs text-t3 px-1">Searching…</p>}

            {results.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-bd rounded-lg divide-y divide-bd">
                {results.map(job => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => { setSelected(job); setConfirmReassign(false); setError(null) }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-pg transition-colors ${
                      selected?.id === job.id ? "bg-ac-bg" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs type-drawing-number text-t1">{job.drawingNumber}</p>
                        <p className="text-xs text-t3 truncate">{job.clientCompany}</p>
                        <p className="text-xs text-t4 truncate">{job.address}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="type-badge px-2 py-0.5 rounded-full bg-t1/[0.06] text-t2">{job.status}</span>
                        {job.quoteValue != null && (
                          <p className="text-xs tabular-nums text-t3 mt-0.5">{formatGBP(job.quoteValue)}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {debouncedSearch.trim() && !loading && results.length === 0 && (
              <p className="text-xs text-t3 px-1">No jobs found.</p>
            )}

            {error && (
              <p className="text-xs text-wn-tx px-1">{error}</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          {quote?.jobId && (
            <Button variant="outline" onClick={handleUnlink} disabled={saving} className="mr-auto text-dn-tx hover:bg-dn-bg">
              <Unlink className="h-3.5 w-3.5" /> Unlink
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleLink}
            disabled={!selected || saving}
            loading={saving}
          >
            <Link2 className="h-3.5 w-3.5" />
            {confirmReassign ? "Confirm move" : "Attach to job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
