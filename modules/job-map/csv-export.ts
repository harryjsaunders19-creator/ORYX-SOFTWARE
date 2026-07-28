import type { JobMapMarker } from "./types/job-map-types"
import { buildCsv } from "@/shared/utils/download-csv"

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
  return buildCsv(headers, rows)
}
