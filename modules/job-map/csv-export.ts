import type { JobMapMarker } from "./types/job-map-types"

export function markersToCsv(markers: JobMapMarker[]): string {
  const headers = [
    "Drawing Number", "Site Address", "Client", "Description",
    "Designer", "Date Created", "Latitude", "Longitude",
  ]
  const rows = markers.map(m => [
    m.drawingNumber,
    m.address,
    m.clientCompany,
    m.description,
    m.designer,
    m.dateCreated.slice(0, 10),
    String(m.lat),
    String(m.lng),
  ])
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  return [headers, ...rows].map(r => r.map(escape).join(",")).join("\n")
}
