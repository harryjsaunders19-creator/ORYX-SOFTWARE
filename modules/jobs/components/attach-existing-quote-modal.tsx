"use client"
import { useEffect, useState } from "react"
import { Search, Link2, Unlink } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { formatGBP } from "@/shared/utils/utils"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import type { Job, Quote } from "@/lib/types"
import { QuoteStatusBadge } from "@/modules/quotes/components/quote-status-badge"
import { cn } from "@/shared/utils/utils"

type QuoteSearchResult = Pick<Quote, "id" | "quoteNumber" | "clientCompany" | "address" | "status" | "quoteValue" | "jobId">

export function AttachExistingQuoteModal({
  job,
  open,
  busy,
  onClose,
  onLinked,
}: {
  job: Job | null | undefined
  open: boolean
  busy?: boolean
  onClose: () => void
  onLinked: () => Promise<void>
}) {
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<QuoteSearchResult[]>([])
  const [selected, setSelected] = useState<QuoteSearchResult | null>(null)
  const [confirmReassign, setConfirmReassign] = useState(false)

  const canSearch = open && !!job && debouncedSearch.trim().length > 0

  useEffect(() => {
    if (!open) return
    setSearch("")
    setResults([])
    setSelected(null)
    setError(null)
    setConfirmReassign(false)
    setSaving(false)
  }, [open, job?.id])

  useEffect(() => {
    if (!canSearch) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/quotes?search=${encodeURIComponent(debouncedSearch)}&page=1&limit=10`)
      .then(r => r.json() as Promise<{ quotes?: Quote[] }>)
      .then(d => {
        if (cancelled) return
        const quotes = d.quotes ?? []
        setResults(
          quotes.map(q => ({
            id: q.id,
            quoteNumber: q.quoteNumber,
            clientCompany: q.clientCompany,
            address: q.address,
            status: q.status,
            quoteValue: q.quoteValue,
            jobId: q.jobId,
          })),
        )
      })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => {
      cancelled = true
    }
  }, [canSearch, debouncedSearch])

  const handleAttach = async () => {
    if (!job || !selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${selected.id}/link-job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, ...(confirmReassign && { confirmReassign: true }) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as {
          error?: string
          requiresConfirmation?: boolean
          currentJobId?: string
        }
        if (body.requiresConfirmation) {
          setConfirmReassign(true)
          setError(`This quote is already linked to another job. Click again to move it.`)
          return
        }
        setError(body.error ?? "Failed to link quote")
        return
      }
      await onLinked()
      onClose()
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  const handleUnlink = async () => {
    if (!job || !selected) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/quotes/${selected.id}/link-job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        setError(body.error ?? "Failed to unlink")
        return
      }
      await onLinked()
      onClose()
    } catch {
      setError("Network error")
    } finally {
      setSaving(false)
    }
  }

  const title = selected?.jobId ? "Change linked quote" : "Attach to job"

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o && !saving && !busy) onClose()
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {job && (
            <DialogDescription>
              Link a quote to <span className="type-drawing-number">{job.drawingNumber}</span>.
            </DialogDescription>
          )}
        </DialogHeader>

        <DialogBody>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-t4 pointer-events-none" />
              <Input
                value={search}
                onChange={e => {
                  setSearch(e.target.value)
                  setSelected(null)
                  setConfirmReassign(false)
                  setError(null)
                }}
                placeholder="Search quotes by number, client, address…"
                className="pl-10"
                autoFocus
              />
            </div>

            {loading && <p className="text-xs text-t3 px-1">Searching…</p>}

            {results.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-bd rounded-lg divide-y divide-bd">
                {results.map(q => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setSelected(q)
                      setConfirmReassign(false)
                      setError(null)
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-pg transition-colors",
                      selected?.id === q.id && "bg-ac-bg",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs type-drawing-number text-t1">{q.quoteNumber}</p>
                        <p className="text-xs text-t3 truncate">{q.clientCompany}</p>
                        <p className="text-xs text-t4 truncate">{q.address}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <QuoteStatusBadge status={q.status} />
                        {q.quoteValue != null && (
                          <p className="text-xs tabular-nums text-t3 mt-0.5">
                            {formatGBP(q.quoteValue)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {debouncedSearch.trim() && !loading && results.length === 0 && (
              <p className="text-xs text-t3 px-1">No quotes found.</p>
            )}

            {job && (
              <p className="text-xs text-t3 px-1">
                No suitable quote?{" "}
                <a
                  href={`/quotes?new=1&jobId=${encodeURIComponent(job.id)}`}
                  className="font-medium text-ac2 hover:underline"
                >
                  Create New Quote
                </a>
              </p>
            )}

            {error && <p className="text-xs text-wn-tx px-1">{error}</p>}
          </div>
        </DialogBody>

        <DialogFooter>
          {job && selected?.jobId && (
            <Button
              variant="outline"
              onClick={() => void handleUnlink()}
              disabled={saving}
              className="mr-auto"
            >
              <Unlink className="h-3.5 w-3.5" /> Unlink
            </Button>
          )}

          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button
            variant="primary"
            onClick={() => void handleAttach()}
            disabled={!selected || saving}
            loading={saving}
          >
            <Link2 className="h-3.5 w-3.5" />
            {confirmReassign ? "Confirm move" : "Attach quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

