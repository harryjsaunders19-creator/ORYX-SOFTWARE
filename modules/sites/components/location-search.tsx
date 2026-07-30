"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { MapPin, Building2, Search, Plus, X } from "lucide-react"
import { cn } from "@/shared/utils/utils"
import type { LocationSearchHit } from "@/modules/sites/api/location-search"

export type LocationSelection = {
  locationMode: "ONE_OFF" | "MANAGED_SITE"
  siteId: string
  locationName: string
  address: string
  postcode: string
  /** Prior one-off jobs at this address (for promote/link). */
  relatedJobIds?: string[]
  suggestManagedSite?: boolean
}

/**
 * Single intelligent location box for New/Edit Job.
 * Searches managed sites and prior job addresses for the selected client.
 */
export function LocationSearch({
  clientId,
  value,
  onChange,
  onCreateManagedSite,
  onPromoteSuggestion,
  error,
  disabled,
}: {
  clientId: string
  value: LocationSelection
  onChange: (next: LocationSelection) => void
  onCreateManagedSite?: () => void
  /** Called when user chooses to convert a multi-job address into a Managed Site. */
  onPromoteSuggestion?: (hit: Extract<LocationSearchHit, { kind: "JOB_LOCATION" }>) => void
  error?: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState(
    value.locationName || value.address || "",
  )
  const [results, setResults] = useState<LocationSearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [linked, setLinked] = useState(Boolean(value.siteId || value.address))
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const label = value.locationName || value.address || ""
    setQuery(label)
    setLinked(Boolean(value.siteId || value.address))
  }, [value.siteId, value.locationName, value.address])

  useEffect(() => {
    if (!clientId) {
      setResults([])
      setQuery("")
      setLinked(false)
    }
  }, [clientId])

  const search = useCallback(async (q: string, signal?: AbortSignal) => {
    if (!clientId) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(
        `/api/locations/search?clientId=${encodeURIComponent(clientId)}&q=${encodeURIComponent(q)}`,
        { signal },
      )
      if (res.ok) {
        const data = await res.json() as { results: LocationSearchHit[] }
        setResults(data.results ?? [])
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
    const t = setTimeout(() => void search(query, ac.signal), 180)
    return () => {
      ac.abort()
      clearTimeout(t)
    }
  }, [open, clientId, query, search])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (
        dropRef.current?.contains(e.target as Node)
        || inputRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const applyFreeText = (text: string) => {
    const trimmed = text.trim()
    onChange({
      locationMode: "ONE_OFF",
      siteId: "",
      locationName: "",
      address: trimmed,
      postcode: "",
      relatedJobIds: [],
      suggestManagedSite: false,
    })
    setLinked(Boolean(trimmed))
    setOpen(false)
  }

  const selectHit = (hit: LocationSearchHit) => {
    if (hit.kind === "MANAGED_SITE") {
      onChange({
        locationMode: "MANAGED_SITE",
        siteId: hit.siteId,
        locationName: hit.locationName,
        address: hit.address,
        postcode: hit.postcode ?? "",
      })
    } else {
      onChange({
        locationMode: "ONE_OFF",
        siteId: "",
        locationName: hit.locationName,
        address: hit.address,
        postcode: hit.postcode ?? "",
        relatedJobIds: hit.sampleJobIds,
        suggestManagedSite: hit.suggestManagedSite,
      })
    }
    setQuery(hit.locationName || hit.address)
    setLinked(true)
    setOpen(false)
  }

  const clear = () => {
    onChange({
      locationMode: "ONE_OFF",
      siteId: "",
      locationName: "",
      address: "",
      postcode: "",
    })
    setQuery("")
    setLinked(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-t4" />
        <input
          ref={inputRef}
          type="text"
          disabled={disabled || !clientId}
          value={query}
          placeholder={clientId ? "Search address, property or existing site..." : "Select a client first"}
          onChange={e => {
            setQuery(e.target.value)
            setLinked(false)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Commit free-text one-off if user typed without picking a hit.
            if (!linked && query.trim()) {
              applyFreeText(query)
            }
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault()
              applyFreeText(query)
            }
            if (e.key === "Escape") setOpen(false)
          }}
          className={cn(
            "h-10 w-full rounded-lg border bg-sr pl-9 pr-9 text-sm text-t1 outline-none",
            "placeholder:text-t4 focus:border-bds",
            error ? "border-dn" : "border-bd",
            (disabled || !clientId) && "opacity-60",
          )}
          autoComplete="off"
        />
        {(query || linked) && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-t4 hover:text-t1"
            aria-label="Clear location"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {error && <p className="mt-0.5 text-xs text-dn">{error}</p>}

      {linked && (value.locationName || value.address) && (
        <div className="mt-2 rounded-lg border border-bd/70 bg-pg px-3 py-2 text-xs text-t2">
          <p className="flex items-start gap-1.5 font-medium text-t1">
            {value.locationMode === "MANAGED_SITE" ? (
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t3" />
            ) : (
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t3" />
            )}
            <span>
              {value.locationName || value.address}
              {value.address && value.locationName && value.address !== value.locationName ? (
                <span className="mt-0.5 block font-normal text-t3">{value.address}</span>
              ) : null}
              {value.locationMode === "MANAGED_SITE" ? (
                <span className="mt-0.5 block font-normal text-t4">Managed site</span>
              ) : (
                <span className="mt-0.5 block font-normal text-t4">One-off property</span>
              )}
            </span>
          </p>
          {value.suggestManagedSite && onPromoteSuggestion && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-ac hover:text-ach"
              onClick={() => {
                onPromoteSuggestion({
                  kind: "JOB_LOCATION",
                  siteId: null,
                  locationName: value.locationName,
                  address: value.address,
                  postcode: value.postcode || null,
                  jobCount: value.relatedJobIds?.length ?? 0,
                  sampleJobIds: value.relatedJobIds ?? [],
                  suggestManagedSite: true,
                })
              }}
            >
              This location already has multiple jobs — create a Managed Site?
            </button>
          )}
        </div>
      )}

      {open && clientId && (
        <div
          ref={dropRef}
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-bd bg-sr shadow-lg"
        >
          {loading && <p className="px-3 py-2 text-xs text-t3">Searching…</p>}
          {!loading && results.map((hit, i) => (
            <button
              key={`${hit.kind}-${hit.locationName}-${i}`}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectHit(hit)}
              className="flex w-full flex-col items-start gap-0.5 border-b border-bd/50 px-3 py-2 text-left last:border-0 hover:bg-pg"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-t1">
                {hit.kind === "MANAGED_SITE" ? (
                  <Building2 className="h-3.5 w-3.5 text-t3" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 text-t3" />
                )}
                {hit.locationName}
              </span>
              {hit.address && hit.address !== hit.locationName && (
                <span className="pl-5 text-xs text-t3">{hit.address}</span>
              )}
              <span className="pl-5 text-[11px] text-t4">
                {hit.kind === "MANAGED_SITE"
                  ? `Managed site · ${hit.jobCount} job${hit.jobCount === 1 ? "" : "s"}`
                  : `${hit.jobCount} existing job${hit.jobCount === 1 ? "" : "s"} at this address`}
              </span>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-t3">
              {query.trim()
                ? "No matches — continue as a one-off job"
                : "Type to search sites and prior addresses"}
            </p>
          )}
          {query.trim() && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => applyFreeText(query)}
              className="flex w-full items-center gap-2 border-t border-bd px-3 py-2.5 text-sm text-t2 hover:bg-pg"
            >
              <MapPin className="h-3.5 w-3.5" />
              Use “{query.trim()}” as one-off location
            </button>
          )}
          {onCreateManagedSite && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setOpen(false)
                onCreateManagedSite()
              }}
              className="flex w-full items-center gap-2 border-t border-bd px-3 py-2.5 text-sm font-medium text-ac hover:bg-pg"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Managed Site
            </button>
          )}
        </div>
      )}
    </div>
  )
}
