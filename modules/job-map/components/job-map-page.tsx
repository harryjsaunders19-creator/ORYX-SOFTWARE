"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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

async function fetchMapData(): Promise<JobMapResponse> {
  const res = await fetch("/api/job-map")
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
  const [dataLoading, setDataLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [mobileFilters, setMobileFilters] = useState(false)
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null)
  const [autoFit, setAutoFit] = useState(true)
  const [missingListKey, setMissingListKey] = useState(0)

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
    return data
  }, [])

  useEffect(() => {
    const cached = getJobMapCache()
    if (cached) {
      setRawData(cached)
      setDataLoading(false)
    }

    let cancelled = false
    if (!cached) setDataLoading(true)
    fetchMapData()
      .then(data => {
        if (cancelled) return
        setJobMapCache(data)
        setRawData(data)
        if (data.markers.length > 0 && !sessionStorage.getItem("oryx-job-map-view")) {
          setAutoFit(true)
        }
      })
      .catch(() => { if (!cached) toast("Failed to load job map", "error") })
      .finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [toast])

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
    const csv = markersToCsv(markers)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `oryx-job-map-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
          <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-t3">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a]" /> Completed projects with coordinates
            </span>
            {(filters.locationFilter ?? "completed") === "manual" && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb]" /> Manually placed pins
              </span>
            )}
          </div>

          <JobMapCanvas
            markers={markers}
            viewMode={filters.viewMode}
            tileMode={filters.tileMode}
            flyTarget={flyTarget}
            highlightClient={filters.highlightClient}
            dataLoading={dataLoading && !rawData}
            autoFit={autoFit}
          />

          {!dataLoading && markers.length === 0 && (
            <p className="text-sm text-t3 text-center mt-4">
              {rawData?.markers.length
                ? "No projects match your filters."
                : "No completed projects with map coordinates yet."}
            </p>
          )}
        </>
      )}
    </PageShell>
  )
}
