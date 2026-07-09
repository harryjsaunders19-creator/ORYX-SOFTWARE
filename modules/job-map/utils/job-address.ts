import type { GeocodeQueueReason } from "../types/location-types"

/** Compose the legacy `address` field from site name + site address. */
export function composeJobAddress(
  siteName: string | null | undefined,
  siteAddress: string | null | undefined,
  fallback = "",
): string {
  const name = siteName?.trim() ?? ""
  const addr = siteAddress?.trim() ?? ""
  if (name && addr) return `${name}, ${addr}`
  if (addr) return addr
  if (name) return name
  return fallback.trim()
}

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i
const IE_EIRCODE = /\b([AC-FHKNPRTV-Y]\d{2}\s*[0-9AC-FHKNPRTV-Y]{4})\b/i
const REGION_ONLY = /^(uk|u\.k\.|united kingdom|ireland|éire|eire|gb|northern ireland)$/i

export function hasPostcode(text: string): boolean {
  return UK_POSTCODE.test(text) || IE_EIRCODE.test(text)
}

function meaningfulAddressParts(addr: string): string[] {
  return addr.split(",").map(p => p.trim()).filter(p => p && !REGION_ONLY.test(p))
}

export interface GeocodeAssessment {
  query: string
  autoEligible: boolean
  queueReason: GeocodeQueueReason
}

/** Classify whether an address is safe to auto-geocode (no city-level guessing). */
export function assessGeocodeInput(
  siteName: string | null | undefined,
  siteAddress: string | null | undefined,
  legacyAddress?: string,
  locationStatus?: string | null,
): GeocodeAssessment {
  const addr = siteAddress?.trim() ?? ""
  const legacy = legacyAddress?.trim() ?? ""

  let query = ""
  if (addr) {
    query = addr
  } else if (legacy && (hasPostcode(legacy) || meaningfulAddressParts(legacy).length >= 2)) {
    query = legacy
  }

  if (!query) {
    const hasNameOnly = !!(siteName?.trim() || legacy)
    return {
      query: "",
      autoEligible: false,
      queueReason: hasNameOnly ? "incomplete_address" : "no_address",
    }
  }

  const parts = meaningfulAddressParts(query)
  const autoEligible = hasPostcode(query) || parts.length >= 2

  if (!autoEligible) {
    return { query, autoEligible: false, queueReason: "incomplete_address" }
  }

  if (locationStatus === "needs_review") {
    return { query, autoEligible: true, queueReason: "geocode_failed" }
  }

  return { query, autoEligible: true, queueReason: "auto_ready" }
}

/** Prefer postal address for geocoding; never guess from site name alone. */
export function buildGeocodeQuery(
  siteName: string | null | undefined,
  siteAddress: string | null | undefined,
  legacyAddress?: string,
): string {
  return assessGeocodeInput(siteName, siteAddress, legacyAddress).query
}

export function displaySiteName(
  siteName: string | null | undefined,
  address: string,
): string {
  if (siteName?.trim()) return siteName.trim()
  const first = address.split(",")[0]?.trim()
  return first || address || "—"
}

export const GEOCODE_QUEUE_LABELS: Record<GeocodeQueueReason, string> = {
  auto_ready: "Ready for auto-locate",
  incomplete_address: "Incomplete address — manual placement",
  geocode_failed: "Auto-locate failed — review manually",
  no_address: "No address on file",
}

const QUEUE_SORT_ORDER: Record<GeocodeQueueReason, number> = {
  incomplete_address: 0,
  no_address: 1,
  geocode_failed: 2,
  auto_ready: 3,
}

export function compareMissingLocationQueue(
  a: { queueReason: GeocodeQueueReason; dateCompleted: string | null },
  b: { queueReason: GeocodeQueueReason; dateCompleted: string | null },
): number {
  const byReason = QUEUE_SORT_ORDER[a.queueReason] - QUEUE_SORT_ORDER[b.queueReason]
  if (byReason !== 0) return byReason
  const aDate = a.dateCompleted ?? ""
  const bDate = b.dateCompleted ?? ""
  return bDate.localeCompare(aDate)
}
