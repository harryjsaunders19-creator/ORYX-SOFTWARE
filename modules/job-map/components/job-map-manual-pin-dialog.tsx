"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import type { MissingLocationJob } from "../types/location-types"
import { buildGeocodeQuery, displaySiteName } from "../utils/job-address"
import type { ManualPinMapProps } from "./job-map-manual-pin-map"

const ManualPinMap = dynamic(
  () => import("./job-map-manual-pin-map").then(m => m.ManualPinMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-surface-low">
        <p className="text-sm text-t3">Loading map…</p>
      </div>
    ),
  },
)

interface SearchResult {
  label: string
  lat: number
  lng: number
}

interface Props {
  job: MissingLocationJob
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function JobMapManualPinDialog({ job, open, onOpenChange, onSaved }: Props) {
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [position, setPosition] = useState<[number, number] | null>(null)
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null)
  const [saving, setSaving] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 350)
  const initialised = useRef(false)

  useEffect(() => {
    if (!open) {
      initialised.current = false
      return
    }
    if (initialised.current) return
    initialised.current = true
    const defaultQuery = buildGeocodeQuery(job.siteName, job.siteAddress, job.address)
    setSearch(defaultQuery)
    setPosition(null)
    setFlyTo(null)
    setResults([])
  }, [open, job])

  useEffect(() => {
    if (!open || debouncedSearch.trim().length < 2) {
      setResults([])
      return
    }
    const ac = new AbortController()
    fetch(`/api/job-map/search?q=${encodeURIComponent(debouncedSearch)}`, { signal: ac.signal })
      .then(r => r.json())
      .then((data: { results: SearchResult[] }) => {
        setResults(data.results ?? [])
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setResults([])
      })
    return () => ac.abort()
  }, [debouncedSearch, open])

  const place = useCallback((lat: number, lng: number) => {
    setPosition([lat, lng])
  }, [])

  const pickResult = useCallback((r: SearchResult) => {
    setPosition([r.lat, r.lng])
    setFlyTo([r.lat, r.lng])
    setSearch(r.label)
    setResults([])
  }, [])

  const save = useCallback(async () => {
    if (!position) return
    setSaving(true)
    try {
      const res = await fetch(`/api/job-map/locations/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: position[0], longitude: position[1] }),
      })
      if (!res.ok) throw new Error("Save failed")
      onSaved()
      onOpenChange(false)
    } catch {
      setSaving(false)
    }
  }, [job.id, onOpenChange, onSaved, position])

  const mapProps: ManualPinMapProps = { position, onPlace: place, flyTo }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Locate {job.drawingNumber}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-t3">
            {displaySiteName(job.siteName, job.address)} — search, click the map, or drag the pin.
          </p>
          <div className="relative">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search building name or address…"
              className="bg-surface-low"
            />
            {results.length > 0 && (
              <div className="absolute z-[600] mt-1 w-full rounded-md border border-bd bg-sr shadow-lg divide-y divide-bd max-h-40 overflow-y-auto">
                {results.map(r => (
                  <button
                    key={`${r.lat},${r.lng},${r.label}`}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs text-t2 hover:bg-surface-low"
                    onClick={() => pickResult(r)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-md border border-bd overflow-hidden" style={{ height: 360 }}>
            <ManualPinMap {...mapProps} />
          </div>
          {position && (
            <p className="text-xs text-t4 type-drawing-number tabular-nums">
              {position[0].toFixed(6)}, {position[1].toFixed(6)}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!position || saving} onClick={save}>
            {saving ? "Saving…" : "Save Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
