"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Search, Plus, X, MapPin } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import { formatSiteAddress } from "@/modules/sites/lib/normalize"
import type { SiteSummary } from "@/modules/sites/types"

interface Props {
  clientId: string
  value: string
  name: string
  onChange: (site: SiteSummary | null) => void
  onCreateNew?: () => void
  disabled?: boolean
  className?: string
  error?: string
}

export function SiteSelector({
  clientId,
  value,
  name,
  onChange,
  onCreateNew,
  disabled,
  className,
  error,
}: Props) {
  const [query, setQuery] = useState(name)
  const [results, setResults] = useState<SiteSummary[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(!!value)
  const [selectedSite, setSelectedSite] = useState<SiteSummary | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setQuery(name)
    setSelected(!!value)
  }, [value, name])

  useEffect(() => {
    if (!clientId) {
      setResults([])
      setSelected(false)
      setSelectedSite(null)
      setQuery("")
      onChange(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when client changes
  }, [clientId])

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    if (!clientId) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/sites/search?clientId=${encodeURIComponent(clientId)}&q=${encodeURIComponent(q)}&limit=10`,
        { signal },
      )
      if (res.ok) {
        const d = await res.json() as { sites: SiteSummary[] }
        setResults(d.sites)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (!open || !clientId) return
    const ac = new AbortController()
    const t = setTimeout(() => { void search(query, ac.signal) }, 150)
    return () => { clearTimeout(t); ac.abort() }
  }, [query, open, search, clientId])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (!selected) setQuery(name)
      }
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [selected, name])

  const select = (site: SiteSummary) => {
    setQuery(site.name)
    setSelected(true)
    setSelectedSite(site)
    setOpen(false)
    onChange(site)
  }

  const clear = () => {
    setQuery("")
    setSelected(false)
    setSelectedSite(null)
    onChange(null)
    inputRef.current?.focus()
    setOpen(true)
    void search("")
  }

  const addressLine = selectedSite
    ? formatSiteAddress(selectedSite)
    : null

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-t4 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setSelected(false)
            setOpen(true)
          }}
          onFocus={() => {
            if (!selected && clientId) {
              setOpen(true)
              void search(query)
            }
          }}
          disabled={disabled || !clientId}
          placeholder={clientId ? "Search or select a site…" : "Select a client first"}
          autoComplete="off"
          className={cn(
            "flex h-10 w-full rounded-lg border bg-sr pl-8 pr-8 text-sm text-t1",
            "placeholder:text-t4",
            "focus:outline-none focus:ring-2 focus:ring-ac/20 focus:border-ac",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-dn" : selected ? "border-bds" : "border-bd",
          )}
        />
        {selected && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-t4 hover:text-t1"
            aria-label="Clear site"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && <p className="mt-0.5 text-xs text-dn">{error}</p>}

      {selected && selectedSite && (
        <div className="mt-2 rounded-lg border border-bd/70 bg-pg px-3 py-2 text-xs text-t2">
          <p className="flex items-start gap-1.5 font-medium text-t1">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t3" />
            <span>
              {selectedSite.name}
              {addressLine ? (
                <span className="mt-0.5 block font-normal text-t3">{addressLine}</span>
              ) : null}
            </span>
          </p>
          {selectedSite.jobCounts && (
            <p className="mt-1.5 text-t3">
              {selectedSite.jobCounts.total} existing job{selectedSite.jobCounts.total === 1 ? "" : "s"}
              {" · "}
              {selectedSite.jobCounts.active} active
            </p>
          )}
        </div>
      )}

      {open && clientId && (
        <div
          ref={dropRef}
          className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-bd bg-sr shadow-lg"
        >
          {loading && <p className="px-3 py-2 text-xs text-t3">Searching…</p>}
          {!loading && results.map(site => {
            const addr = formatSiteAddress(site)
            const counts = site.jobCounts
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => select(site)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-bd/50 px-3 py-2 text-left last:border-0 hover:bg-pg"
              >
                <span className="text-sm font-medium text-t1">{site.name}</span>
                {addr && <span className="text-xs text-t3">{addr}</span>}
                {counts && (
                  <span className="text-[11px] text-t4">
                    {counts.total} jobs · {counts.active} active
                  </span>
                )}
              </button>
            )
          })}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-t3">
              {query.trim() ? "No matching sites" : "No sites for this client yet"}
            </p>
          )}
          {onCreateNew && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onCreateNew()
              }}
              className="flex w-full items-center gap-2 border-t border-bd px-3 py-2.5 text-sm font-medium text-ac hover:bg-pg"
            >
              <Plus className="h-3.5 w-3.5" />
              Create New Site
            </button>
          )}
        </div>
      )}
    </div>
  )
}
