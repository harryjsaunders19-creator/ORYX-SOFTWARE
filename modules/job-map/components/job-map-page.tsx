"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { PageHeader, PageShell } from "@/shared/layouts/page-layout"
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value"
import { useToast } from "@/shared/ui/toast"
import { useUser } from "@/shared/providers/user-context"
import { JobMapStats } from "./job-map-stats"
import { JobMapFiltersBar, type JobMapFiltersState } from "./job-map-filters"
import type { JobMapMarker, JobMapResponse } from "../types/job-map-types"
import type { BulkGeocodeResult } from "../types/location-types"
import {
  computeFilteredStats,
  filterMarkers,
  getJobMapCache,
  setJobMapCache,
  clearJobMapCache,
} from "../cache/session-cache"
import { markersToCsv } from "../csv-export"
import { downloadCsv } from "@/shared/utils/download-csv"

const JobMapCanvas = dynamic(
  () => import("./job-map-canvas").then(m => m.JobMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-md border border-bd bg-surface-low flex items-center justify-center"
        style={{ height: "min(70vh, 720px)", minHeight: 360 }}
      >
        <p className="text-sm text-t3">Loading map…</p>
      </div>
    ),
  },
)

const JobMapMissingLocations = dynamic(
  () => import("./job-map-missing-locations").then(m => m.JobMapMissingLocations),
  { ssr: false },
)

async function fetchMapData(bbox?: {
  south: number
  west: number
  north: number
  east: number
}): Promise<JobMapResponse> {
  const params = bbox
    ? `?south=${bbox.south}&west=${bbox.west}&north=${bbox.north}&east=${bbox.east}`
    : ""
  const res = await fetch(`/api/job-map${params}`)
  if (!res.ok) throw new Error("Failed to load")
  return res.json() as Promise<JobMapResponse>
}

export default function JobMapPage() {
  const { toast } = useToast()
  const { isAdmin } = useUser()
  const [filters, setFilters] = useState<JobMapFiltersState>({
    viewMode: "pins",
    tileMode: "street",
    locationFilter: "completed",
  })
  const [rawData, setRawData] = useState<JobMapResponse | null>(null)
  const [baseMarkers, setBaseMarkers] = useState<JobMapMarker[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [viewportLoading, setViewportLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [mobileFilters, setMobileFilters] = useState(false)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [autoFit, setAutoFit] = useState(true)
  const [missingListKey, setMissingListKey] = useState(0)
  const viewportModeRef = useRef(false)

  useEffect(() => {
    if (sessionStorage.getItem("oryx-job-map-view")) {
      setAutoFit(false)
    }
  }, [])

  const debouncedSearch = useDebouncedValue(filters.search ?? "", 300)
  const showMissingList = (filters.locationFilter ?? "completed") === "missing"

  const refreshMapData = useCallback(async () => {
    clearJobMapCache()
    const data = await fetchMapData()
    setJobMapCache(data)
    setRawData(data)
    setBaseMarkers(data.markers)
    viewportModeRef.current = false
    return data
  }, [])

  useEffect(() => {
    const cached = getJobMapCache()
    if (cached) {
      setRawData(cached)
      setBaseMarkers(cached.markers)
      setDataLoading(false)
    }

    let cancelled = false
    if (!cached) setDataLoading(true)
    fetchMapData()
      .then(data => {
        if (cancelled) return
        setJobMapCache(data)
        setRawData(data)
        setBaseMarkers(data.markers)
        if (data.markers.length > 0 && !sessionStorage.getItem("oryx-job-map-view")) {
          setAutoFit(true)
        }
      })
      .catch(() => { if (!cached) toast("Failed to load job map", "error") })
      .finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [toast])

  const onBoundsChange = useCallback(async (
    bounds: { south: number; west: number; north: number; east: number } | null,
    _zoom: number,
  ) => {
    if (!bounds) {
      if (viewportModeRef.current) {
        viewportModeRef.current = false
        setRawData(prev => prev
          ? { ...prev, markers: baseMarkers, truncated: false }
          : prev)
      }
      return
    }

    setViewportLoading(true)
    try {
      const data = await fetchMapData(bounds)
      viewportModeRef.current = true
      setRawData(prev => ({
        markers: data.markers,
        stats: prev?.stats ?? data.stats,
        clients: prev?.clients?.length ? prev.clients : data.clients,
        designers: prev?.designers?.length ? prev.designers : data.designers,
        missingCoordinates: prev?.missingCoordinates ?? data.missingCoordinates,
        truncated: data.truncated,
      }))
    } catch {
      // Keep current markers on transient viewport fetch failure.
    } finally {
      setViewportLoading(false)
    }
  }, [baseMarkers])

  const filterInput = useMemo(() => ({
    search: debouncedSearch,
    client: filters.client,
    designer: filters.designer,
    typeOfWorks: filters.typeOfWorks,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    highlightClient: filters.highlightClient,
    locationFilter: filters.locationFilter,
  }), [
    debouncedSearch,
    filters.client,
    filters.designer,
    filters.typeOfWorks,
    filters.dateFrom,
    filters.dateTo,
    filters.highlightClient,
    filters.locationFilter,
  ])

  const markers = useMemo(
    () => filterMarkers(rawData?.markers ?? [], filterInput),
    [rawData?.markers, filterInput],
  )

  const stats = useMemo(
    () => computeFilteredStats(markers, rawData?.stats.missingLocations ?? rawData?.missingCoordinates ?? 0),
    [markers, rawData],
  )

  const searchResults = useMemo(() => {
    const q = (filters.search ?? "").trim().toLowerCase()
    if (!q || q.length < 2 || showMissingList) return []
    return markers.filter(m =>
      m.drawingNumber.toLowerCase().includes(q)
      || m.address.toLowerCase().includes(q)
      || m.clientCompany.toLowerCase().includes(q),
    ).slice(0, 8)
  }, [markers, filters.search, showMissingList])

  const patchFilters = useCallback((patch: Partial<JobMapFiltersState>) => {
    setAutoFit(false)
    setFilters(prev => ({ ...prev, ...patch }))
  }, [])

  const zoomToMarker = useCallback((marker: JobMapMarker) => {
    setFlyTarget({ lat: marker.lat, lng: marker.lng })
    setAutoFit(false)
  }, [])

  const exportCsv = useCallback(() => {
    if (!markers.length) {
      toast("No projects to export", "error")
      return
    }
    downloadCsv(
      `oryx-job-map-${new Date().toISOString().slice(0, 10)}.csv`,
      markersToCsv(markers),
    )
  }, [markers, toast])

  const findMissingLocations = useCallback(async () => {
    setGeocoding(true)
    try {
      const res = await fetch("/api/job-map/geocode", { method: "POST" })
      if (!res.ok) throw new Error("Geocoding failed")
      const result = await res.json() as BulkGeocodeResult
      await refreshMapData()
      setMissingListKey(k => k + 1)
      if (result.located > 0) setAutoFit(true)
      toast(
        `Processed: ${result.processed} · Located: ${result.located} · Needs review: ${result.needsReview}`,
        result.located > 0 ? "success" : "info",
      )
    } catch {
      toast("Failed to find missing locations", "error")
    } finally {
      setGeocoding(false)
    }
  }, [refreshMapData, toast])

  const onLocationUpdated = useCallback(async () => {
    await refreshMapData()
    setMissingListKey(k => k + 1)
  }, [refreshMapData])

  const missingCoordinates = rawData?.missingCoordinates ?? 0

  return (
    <PageShell wide className="max-md:px-3">
      <PageHeader
        title="Job Map"
        description="Completed projects mapped by site location"
      />

      <JobMapStats stats={stats} loading={dataLoading && !rawData} />

      <JobMapFiltersBar
        filters={filters}
        clients={rawData?.clients ?? []}
        designers={rawData?.designers ?? []}
        mobileOpen={mobileFilters}
        missingCoordinates={missingCoordinates}
        isAdmin={isAdmin}
        geocoding={geocoding}
        onGenerateCoordinates={findMissingLocations}
        onChange={patchFilters}
        onMobileOpen={setMobileFilters}
        onExportCsv={exportCsv}
        highlightClient={filters.highlightClient}
        onClientLegendClick={client => patchFilters({
          highlightClient: client || undefined,
          client: client || undefined,
        })}
      />

      {searchResults.length > 0 && (
        <div className="mb-3 oryx-surface-card bg-sr border border-bd rounded-md divide-y divide-bd max-h-48 overflow-y-auto thin-scroll">
          {searchResults.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => zoomToMarker(m)}
              className="w-full text-left px-4 py-2.5 hover:bg-surface-low transition-colors"
            >
              <p className="text-sm font-medium text-t1">{m.drawingNumber}</p>
              <p className="text-xs text-t3 truncate">{m.address} · {m.clientCompany}</p>
            </button>
          ))}
        </div>
      )}

      {showMissingList ? (
        <JobMapMissingLocations
          key={missingListKey}
          isAdmin={isAdmin}
          onLocated={onLocationUpdated}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-3 type-helper text-t3">
            <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-ok-ic" /> Completed projects with coordinates
            </span>
            {(filters.locationFilter ?? "completed") === "manual" && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-ac" /> Manually placed pins
              </span>
            )}
          </div>

          <JobMapCanvas
            markers={markers}
            viewMode={filters.viewMode}
            tileMode={filters.tileMode}
            flyTarget={flyTarget}
            highlightClient={filters.highlightClient}
            dataLoading={(dataLoading && !rawData) || viewportLoading}
            autoFit={autoFit}
            onBoundsChange={onBoundsChange}
          />

          {!dataLoading && markers.length === 0 && (
            <p className="text-sm text-t3 text-center mt-4">
              {rawData?.markers.length
                ? "No projects match your filters."
                : "No completed projects with map coordinates yet."}
            </p>
          )}
          {rawData?.truncated && (
            <p className="text-xs text-t4 text-center mt-2">
              Showing the newest matches in this view — zoom or pan to load other areas.
            </p>
          )}
        </>
      )}
    </PageShell>
  )
}
