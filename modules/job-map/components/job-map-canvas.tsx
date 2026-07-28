"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster"
import "leaflet.markercluster/dist/MarkerCluster.css"
import "leaflet.markercluster/dist/MarkerCluster.Default.css"
import "leaflet.heat"
import type { JobMapMarker, JobMapTileMode, JobMapViewMode } from "../types/job-map-types"
import {
  COMPLETED_MARKER_COLOR,
  MAP_MARKER_ICONS,
  MAP_SESSION_KEY,
  MAP_TILES,
  MARKER_CHUNK_SIZE,
  UK_IRELAND_BOUNDS,
  UK_IRELAND_DEFAULT_CENTER,
  UK_IRELAND_DEFAULT_ZOOM,
  UK_IRELAND_MIN_ZOOM,
  UK_IRELAND_MAX_ZOOM,
  VIEWPORT_FETCH_MIN_ZOOM,
  VIEWPORT_BBOX_PAD,
  isWithinUkIreland,
} from "../constants"

type MarkerClusterGroup = L.LayerGroup & {
  addLayer: (layer: L.Layer) => MarkerClusterGroup
  clearLayers: () => void
}

const createMarkerClusterGroup = (L as typeof L & {
  markerClusterGroup: (options?: object) => MarkerClusterGroup
}).markerClusterGroup

function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function formatMarkerDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return iso.slice(0, 10)
  }
}

function markerDivIcon(marker: JobMapMarker, dimmed: boolean): L.DivIcon {
  const emoji = MAP_MARKER_ICONS[marker.iconKey] ?? "📍"
  const opacity = dimmed ? 0.25 : 1
  return L.divIcon({
    className: "job-map-marker-icon",
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${COMPLETED_MARKER_COLOR};border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      font-size:14px;line-height:1;opacity:${opacity};
    ">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

function popupHtml(marker: JobMapMarker): string {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${marker.lat},${marker.lng}`
  return `<div class="job-map-popup space-y-2 text-sm" style="min-width:240px;font-family:system-ui,sans-serif">
    <p style="font-weight:600;margin:0">${escHtml(marker.drawingNumber)}</p>
    <p style="color:#6b7280;font-size:12px;margin:0">${escHtml(marker.address)}</p>
    <dl style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;margin:0">
      <dt style="color:#9ca3af">Client</dt><dd style="margin:0">${escHtml(marker.clientCompany)}</dd>
      <dt style="color:#9ca3af">Type</dt><dd style="margin:0">${escHtml(marker.description)}</dd>
      <dt style="color:#9ca3af">Designer</dt><dd style="margin:0">${escHtml(marker.designer)}</dd>
      <dt style="color:#9ca3af">Created</dt><dd style="margin:0">${escHtml(formatMarkerDate(marker.dateCreated))}</dd>
    </dl>
    <div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:4px">
      <a href="/jobs/${escHtml(marker.id)}" style="font-size:12px;padding:4px 10px;background:var(--color-ac,#111827);color:var(--color-on-ac,#fff);border-radius:8px;text-decoration:none">Open Job</a>
      <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px;padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;text-decoration:none;color:inherit">Google Maps</a>
    </div>
  </div>`
}

function MapInvalidateSize() {
  const map = useMap()
  useEffect(() => {
    const fix = () => { try { map.invalidateSize() } catch { /* ignore */ } }
    const t = window.setTimeout(fix, 0)
    const t2 = window.setTimeout(fix, 250)
    const el = map.getContainer()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fix) : null
    ro?.observe(el)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
      ro?.disconnect()
    }
  }, [map])
  return null
}

function MapSessionView() {
  const map = useMap()

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MAP_SESSION_KEY)
      if (raw) {
        const { center, zoom } = JSON.parse(raw) as { center: [number, number]; zoom: number }
        if (Array.isArray(center) && typeof zoom === "number") {
          map.setView(center, zoom, { animate: false })
        }
      }
    } catch { /* ignore */ }

    const save = () => {
      const c = map.getCenter()
      sessionStorage.setItem(MAP_SESSION_KEY, JSON.stringify({
        center: [c.lat, c.lng],
        zoom: map.getZoom(),
      }))
    }
    map.on("moveend", save)
    return () => { map.off("moveend", save) }
  }, [map])

  return null
}

function ViewportBoundsWatcher({
  onBoundsChange,
}: {
  onBoundsChange?: (bounds: { south: number; west: number; north: number; east: number } | null, zoom: number) => void
}) {
  const map = useMap()

  useEffect(() => {
    if (!onBoundsChange) return

    let timer: number | null = null
    const emit = () => {
      const zoom = map.getZoom()
      if (zoom < VIEWPORT_FETCH_MIN_ZOOM) {
        onBoundsChange(null, zoom)
        return
      }
      const b = map.getBounds()
      const latPad = (b.getNorth() - b.getSouth()) * VIEWPORT_BBOX_PAD
      const lngPad = (b.getEast() - b.getWest()) * VIEWPORT_BBOX_PAD
      onBoundsChange({
        south: b.getSouth() - latPad,
        west: b.getWest() - lngPad,
        north: b.getNorth() + latPad,
        east: b.getEast() + lngPad,
      }, zoom)
    }

    const onMoveEnd = () => {
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(emit, 350)
    }

    map.on("moveend", onMoveEnd)
    map.on("zoomend", onMoveEnd)
    return () => {
      if (timer != null) window.clearTimeout(timer)
      map.off("moveend", onMoveEnd)
      map.off("zoomend", onMoveEnd)
    }
  }, [map, onBoundsChange])

  return null
}

function FlyToTarget({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), { duration: 0.8 })
  }, [map, target])
  return null
}

function FitAllMarkers({
  markers,
  enabled,
  ready,
}: {
  markers: JobMapMarker[]
  enabled: boolean
  ready: boolean
}) {
  const map = useMap()
  const prevCount = useRef(0)

  useEffect(() => {
    if (!ready || !markers.length) return
    const shouldFit = enabled || (prevCount.current === 0 && markers.length > 0)
    prevCount.current = markers.length
    if (!shouldFit) return

    const bounds = L.latLngBounds(UK_IRELAND_BOUNDS)
    if (markers.length) {
      const markerBounds = L.latLngBounds(markers.map(m => [m.lat, m.lng] as [number, number]))
      if (markerBounds.isValid()) {
        map.fitBounds(markerBounds, { padding: [48, 48], maxZoom: 12 })
        return
      }
    }
    map.fitBounds(bounds, { padding: [24, 24] })
  }, [map, markers, enabled, ready])

  return null
}

const HeatmapLayer = memo(function HeatmapLayer({ markers }: { markers: JobMapMarker[] }) {
  const map = useMap()
  const pointsKey = useMemo(
    () => markers.map(m => `${m.id}:${m.lat},${m.lng}`).join("|"),
    [markers],
  )

  useEffect(() => {
    if (!markers.length) return
    const points = markers.map(m => [m.lat, m.lng, 0.6] as [number, number, number])
    const layer = (L as typeof L & {
      heatLayer: (p: [number, number, number][], o?: object) => L.Layer
    }).heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 14,
      gradient: { 0.2: "#0369A1", 0.5: "#B45309", 0.8: "#15803D", 1: "#C0362C" },
    })
    layer.addTo(map)
    return () => { map.removeLayer(layer) }
  }, [map, pointsKey, markers])

  return null
})

function ImperativeClusterLayer({
  markers,
  highlightClient,
  onProgress,
}: {
  markers: JobMapMarker[]
  highlightClient?: string
  onProgress: (loaded: number, total: number) => void
}) {
  const map = useMap()
  const clusterRef = useRef<MarkerClusterGroup | null>(null)
  const markerById = useRef<Map<string, L.Marker>>(new Map())
  const markersRef = useRef(markers)
  const rafRef = useRef<number | null>(null)
  const loadGenRef = useRef(0)

  const clearCluster = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }
    markerById.current.clear()
  }, [map])

  useEffect(() => {
    markersRef.current = markers
    const gen = ++loadGenRef.current
    clearCluster()

    if (!markers.length) {
      onProgress(0, 0)
      return () => { loadGenRef.current = gen + 1 }
    }

    const total = markers.length
    const cluster = typeof createMarkerClusterGroup === "function"
      ? createMarkerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 50,
        maxClusterRadius: 50,
        showCoverageOnHover: false,
        disableClusteringAtZoom: 16,
      })
      : null
    if (!cluster) {
      onProgress(total, total)
      return () => { loadGenRef.current = gen + 1 }
    }
    clusterRef.current = cluster
    map.addLayer(cluster)

    let index = 0
    const dimClient = highlightClient
    onProgress(0, total)

    const addChunk = () => {
      if (loadGenRef.current !== gen) return
      const end = Math.min(index + MARKER_CHUNK_SIZE, total)
      const dimmed = !!dimClient
      for (; index < end; index++) {
        const m = markers[index]
        const isDimmed = dimmed && m.clientCompany !== dimClient
        const leafletMarker = L.marker([m.lat, m.lng], {
          icon: markerDivIcon(m, isDimmed),
        })
        leafletMarker.bindPopup(popupHtml(m), { minWidth: 260 })
        cluster.addLayer(leafletMarker)
        markerById.current.set(m.id, leafletMarker)
      }
      onProgress(index, total)
      if (index < total) {
        rafRef.current = requestAnimationFrame(addChunk)
      }
    }

    rafRef.current = requestAnimationFrame(addChunk)

    return () => {
      // Lint: use effect-local `gen` — do not read loadGenRef.current in cleanup.
      loadGenRef.current = gen + 1
      clearCluster()
    }
  }, [markers, highlightClient, map, clearCluster, onProgress])

  useEffect(() => {
    const dimmed = !!highlightClient
    for (const m of markersRef.current) {
      const leafletMarker = markerById.current.get(m.id)
      if (!leafletMarker) continue
      const isDimmed = dimmed && m.clientCompany !== highlightClient
      leafletMarker.setIcon(markerDivIcon(m, isDimmed))
    }
  }, [highlightClient])

  return null
}

interface Props {
  markers: JobMapMarker[]
  viewMode: JobMapViewMode
  tileMode: JobMapTileMode
  flyTarget: { lat: number; lng: number } | null
  highlightClient?: string
  dataLoading?: boolean
  autoFit: boolean
  onBoundsChange?: (bounds: { south: number; west: number; north: number; east: number } | null, zoom: number) => void
}

export const JobMapCanvas = memo(function JobMapCanvas({
  markers,
  viewMode,
  tileMode,
  flyTarget,
  highlightClient,
  dataLoading,
  autoFit,
  onBoundsChange,
}: Props) {
  const [markerProgress, setMarkerProgress] = useState({ loaded: 0, total: 0 })
  const markersReady = markerProgress.total > 0 && markerProgress.loaded >= markerProgress.total

  const onProgress = useCallback((loaded: number, total: number) => {
    setMarkerProgress({ loaded, total })
  }, [])

  const center = useMemo<[number, number]>(() => UK_IRELAND_DEFAULT_CENTER, [])
  const inRegionMarkers = useMemo(
    () => markers.filter(m => isWithinUkIreland(m.lat, m.lng)),
    [markers],
  )
  const tiles = MAP_TILES[tileMode]
  const showMarkerLoading = dataLoading || (inRegionMarkers.length > 0 && !markersReady)

  return (
    <div className="relative rounded-md border border-bd overflow-hidden bg-surface-low job-map-shell" style={{ height: "min(70vh, 720px)", minHeight: 360 }}>
      {showMarkerLoading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] px-3 py-1.5 rounded-full bg-sr/90 border border-bd text-xs text-t2 shadow-sm">
          {dataLoading
            ? "Loading projects…"
            : `Plotting ${markerProgress.loaded.toLocaleString()} / ${markerProgress.total.toLocaleString()} projects…`}
        </div>
      )}
      <MapContainer
        center={center}
        zoom={UK_IRELAND_DEFAULT_ZOOM}
        minZoom={UK_IRELAND_MIN_ZOOM}
        maxZoom={UK_IRELAND_MAX_ZOOM}
        maxBounds={UK_IRELAND_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full z-0"
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer attribution={tiles.attribution} url={tiles.url} />
        <MapInvalidateSize />
        <MapSessionView />
        <ViewportBoundsWatcher onBoundsChange={onBoundsChange} />
        <FlyToTarget target={flyTarget} />
        <FitAllMarkers markers={inRegionMarkers} enabled={autoFit} ready={markersReady || inRegionMarkers.length === 0} />

        {viewMode === "heatmap" ? (
          <HeatmapLayer markers={inRegionMarkers} />
        ) : (
          <ImperativeClusterLayer
            markers={inRegionMarkers}
            highlightClient={highlightClient}
            onProgress={onProgress}
          />
        )}
      </MapContainer>
    </div>
  )
})
