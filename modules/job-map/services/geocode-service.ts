import {
  normalizeMapAddress,
  UK_IRELAND_GEOCODE_BBOX,
  isWithinUkIreland,
} from "../constants"

const USER_AGENT = "ORYX-Software/1.0 (job-map geocoding)"
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
/** Irish Eircode — routing key + unique identifier */
const IE_EIRCODE = /\b([AC-FHKNPRTV-Y]\d{2}\s*[0-9AC-FHKNPRTV-Y]{4})\b/i

let lastNominatimAt = 0

export interface GeocodeResult {
  lat: number
  lng: number
}

function acceptResult(result: GeocodeResult | null): GeocodeResult | null {
  if (!result) return null
  return isWithinUkIreland(result.lat, result.lng) ? result : null
}

function looksIrish(address: string): boolean {
  return /\b(ireland|éire|eire|dublin|cork|galway|limerick|waterford|kilkenny|wexford|kerry|mayo|donegal|sligo|clare|tipperary|offaly|laois|westmeath|longford|roscommon|leitrim|cavan|monaghan|meath|louth|wicklow|kildare|carlow)\b/i.test(address)
    || /\bco\.?\s+[a-z]/i.test(address)
    || IE_EIRCODE.test(address)
}

/** Build progressively broader queries — full address first, then city/region. */
export function buildGeocodeAttempts(address: string): string[] {
  const trimmed = address.trim()
  if (!trimmed) return []

  const attempts = new Set<string>()
  attempts.add(trimmed)

  const parts = trimmed.split(",").map(p => p.trim()).filter(Boolean)
  const irish = looksIrish(trimmed)

  if (parts.length >= 3) {
    const city = parts[parts.length - 2]
    if (city && !/^\d/.test(city) && !UK_POSTCODE.test(city) && !IE_EIRCODE.test(city)) {
      attempts.add(`${city}, ${irish ? "Ireland" : "United Kingdom"}`)
      attempts.add(`${city}, ${irish ? "IE" : "UK"}`)
    }
  }

  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    const city = UK_POSTCODE.test(last) || IE_EIRCODE.test(last)
      ? parts[parts.length - 2]
      : last
    if (city && !/^\d/.test(city) && !UK_POSTCODE.test(city) && !IE_EIRCODE.test(city)) {
      attempts.add(`${city}, ${irish ? "Ireland" : "United Kingdom"}`)
      attempts.add(`${city}, ${irish ? "IE" : "UK"}`)
    }
  }

  if (irish) {
    attempts.add(`${trimmed}, Ireland`)
  }

  return [...attempts]
}

function extractUkPostcode(address: string): string | null {
  const m = address.match(UK_POSTCODE)
  return m ? m[1].replace(/\s+/g, " ").trim().toUpperCase() : null
}

function extractEircode(address: string): string | null {
  const m = address.match(IE_EIRCODE)
  return m ? m[1].replace(/\s+/g, " ").trim().toUpperCase() : null
}

async function geocodeViaPostcodesIo(postcode: string): Promise<GeocodeResult | null> {
  const compact = postcode.replace(/\s+/g, "")
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json() as { status: number; result?: { latitude: number; longitude: number } }
    if (data.status !== 200 || !data.result) return null
    return acceptResult({ lat: data.result.latitude, lng: data.result.longitude })
  } catch {
    return null
  }
}

async function geocodeViaPhoton(query: string): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      limit: "1",
      lang: "en",
      bbox: UK_IRELAND_GEOCODE_BBOX,
    })
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      features?: { geometry?: { coordinates?: [number, number] } }[]
    }
    const coords = data.features?.[0]?.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    const [lng, lat] = coords
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return acceptResult({ lat, lng })
  } catch {
    return null
  }
}

async function geocodeViaNominatim(query: string, countryCodes: string): Promise<GeocodeResult | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastNominatimAt))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastNominatimAt = Date.now()

  try {
    const params = new URLSearchParams({
      format: "json",
      q: query,
      countrycodes: countryCodes,
      limit: "1",
    })
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    })
    if (res.status === 429) return null
    if (!res.ok) return null
    const data = await res.json() as { lat?: string; lon?: string }[]
    const hit = data[0]
    if (!hit?.lat || !hit.lon) return null
    const lat = Number(hit.lat)
    const lng = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return acceptResult({ lat, lng })
  } catch {
    return null
  }
}

export interface GeocodeOptions {
  /** When true, only geocode the exact address (postcode lookup + one full-text attempt). */
  strict?: boolean
}

/** Geocode a UK/Ireland site address — postcodes.io, then Photon, then Nominatim. */
export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {},
): Promise<GeocodeResult | null> {
  const strict = options.strict ?? false
  const postcode = extractUkPostcode(address)
  if (postcode) {
    const fromPostcode = await geocodeViaPostcodesIo(postcode)
    if (fromPostcode) return fromPostcode
  }

  const eircode = extractEircode(address)
  if (eircode) {
    const eircodeQueries = strict
      ? [`${eircode}, Ireland`]
      : buildGeocodeAttempts(`${eircode}, Ireland`)
    for (const query of eircodeQueries) {
      const fromNominatim = await geocodeViaNominatim(query, "ie")
      if (fromNominatim) return fromNominatim
    }
  }

  const countryCodes = looksIrish(address) ? "ie,gb" : "gb,ie"
  const attempts = strict ? [address.trim()].filter(Boolean) : buildGeocodeAttempts(address)

  for (const query of attempts) {
    const fromPhoton = await geocodeViaPhoton(query)
    if (fromPhoton) return fromPhoton
  }

  for (const query of attempts) {
    const fromNominatim = await geocodeViaNominatim(query, countryCodes)
    if (fromNominatim) return fromNominatim
  }

  return null
}

export function geocodedAddressKey(address: string): string {
  return normalizeMapAddress(address)
}

export interface LocationSearchResult {
  label: string
  lat: number
  lng: number
}

/** Search UK/Ireland locations for manual pin placement. */
export async function searchLocations(query: string, limit = 6): Promise<LocationSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []

  try {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
      lang: "en",
      bbox: UK_IRELAND_GEOCODE_BBOX,
    })
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json() as {
      features?: {
        properties?: { name?: string; street?: string; city?: string; postcode?: string; country?: string }
        geometry?: { coordinates?: [number, number] }
      }[]
    }
    const results: LocationSearchResult[] = []
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue
      const [lng, lat] = coords
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (!isWithinUkIreland(lat, lng)) continue
      const p = f.properties ?? {}
      const parts = [p.name, p.street, p.city, p.postcode, p.country].filter(Boolean)
      const label = parts.join(", ") || q
      results.push({ label, lat, lng })
    }
    return results
  } catch {
    return []
  }
}
