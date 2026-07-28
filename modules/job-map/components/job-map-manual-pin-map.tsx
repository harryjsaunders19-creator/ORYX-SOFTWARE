"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { MAP_TILES, UK_IRELAND_DEFAULT_CENTER, UK_IRELAND_DEFAULT_ZOOM, UK_IRELAND_BOUNDS } from "../constants"

function ClickToPlace({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [map, lat, lng])
  return null
}

export interface ManualPinMapProps {
  position: [number, number] | null
  onPlace: (lat: number, lng: number) => void
  flyTo: [number, number] | null
}

export function ManualPinMap({ position, onPlace, flyTo }: ManualPinMapProps) {
  const icon = L.divIcon({
    className: "job-map-marker-icon",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#111827;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })

  return (
    <MapContainer
      center={position ?? UK_IRELAND_DEFAULT_CENTER}
      zoom={UK_IRELAND_DEFAULT_ZOOM}
      minZoom={5}
      maxZoom={18}
      maxBounds={UK_IRELAND_BOUNDS}
      className="h-full w-full rounded-md"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer attribution={MAP_TILES.street.attribution} url={MAP_TILES.street.url} />
      <ClickToPlace onPlace={onPlace} />
      {flyTo && <FlyTo lat={flyTo[0]} lng={flyTo[1]} />}
      {position && (
        <Marker
          position={position}
          icon={icon}
          draggable
          eventHandlers={{
            dragend: e => {
              const { lat, lng } = e.target.getLatLng()
              onPlace(lat, lng)
            },
          }}
        />
      )}
    </MapContainer>
  )
}
