/** Normalise an address for geocode cache comparison. */
export function normalizeMapAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ")
}

export function jobDescriptionFromRow(row: {
  typeOfWorks: string
  customTypeDescription: string | null
}): string {
  if (row.typeOfWorks === "Other" && row.customTypeDescription) return row.customTypeDescription
  return row.typeOfWorks
}

export function getMapMarkerIconKey(typeOfWorks: string): string {
  const t = typeOfWorks.toLowerCase()
  if (t.includes("temporary roof")) return "roof"
  if (t.includes("access scaffold") || t.includes("bridged access") || t.includes("freestanding")) return "access"
  if (t.includes("propping") || t.includes("shoring") || t.includes("support")) return "support"
  if (t.includes("hoist")) return "hoist"
  if (t.includes("staircase") || t.includes("tower")) return "staircase"
  return "scaffold"
}

export const MAP_MARKER_ICONS: Record<string, string> = {
  roof: "🏠",
  access: "🪜",
  support: "🏗️",
  hoist: "⬆️",
  staircase: "🪜",
  scaffold: "📍",
}

export const MAP_SESSION_KEY = "oryx-job-map-view"
export const COMPLETED_MARKER_COLOR = "#16a34a"
export const MARKER_CHUNK_SIZE = 500
/** At/above this zoom, refetch markers for the visible padded bbox. */
export const VIEWPORT_FETCH_MIN_ZOOM = 9
/** Expand bounds by this fraction so edge markers aren't clipped. */
export const VIEWPORT_BBOX_PAD = 0.15

/** Southwest and northeast corners — UK + Ireland (incl. NI). */
export const UK_IRELAND_BOUNDS: [[number, number], [number, number]] = [
  [49.5, -11.5],
  [61.0, 2.5],
]

export const UK_IRELAND_DEFAULT_CENTER: [number, number] = [54.0, -4.0]
export const UK_IRELAND_DEFAULT_ZOOM = 6
export const UK_IRELAND_MIN_ZOOM = 5
export const UK_IRELAND_MAX_ZOOM = 18

/** Photon/Nominatim bias box: minLon,minLat,maxLon,maxLat */
export const UK_IRELAND_GEOCODE_BBOX = "-11.5,49.5,2.5,61.0"

export function isWithinUkIreland(lat: number, lng: number): boolean {
  const [[south, west], [north, east]] = UK_IRELAND_BOUNDS
  return lat >= south && lat <= north && lng >= west && lng <= east
}

export const MAP_TILES = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "&copy; Esri",
  },
} as const
