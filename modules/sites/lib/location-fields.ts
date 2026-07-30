/**
 * Resolve Job / ParentJob location fields from form or API input.
 * Keeps siteName/siteAddress in sync with locationName/address for register & search.
 */
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { parseLegacySiteAddress, normalizePostcode } from "./normalize"

export type LocationMode = "ONE_OFF" | "MANAGED_SITE"

export type ResolvedLocation = {
  locationMode: LocationMode
  siteId: string | null
  locationName: string | null
  address: string
  postcode: string | null
  /** Denormalized mirrors for existing UI / search */
  siteName: string | null
  siteAddress: string | null
}

export function extractPostcode(
  postcode: string | null | undefined,
  ...addressParts: Array<string | null | undefined>
): string | null {
  const direct = postcode?.trim()
  if (direct) {
    const spaced = direct.toUpperCase().replace(/\s+/g, " ").trim()
    return spaced || null
  }
  for (const part of addressParts) {
    const parsed = parseLegacySiteAddress(part)
    if (parsed.postcode) return parsed.postcode
  }
  return null
}

export function resolveLocationFields(input: {
  locationMode?: LocationMode | "SINGLE_PROPERTY" | null
  siteId?: string | null
  locationName?: string | null
  siteName?: string | null
  address?: string | null
  siteAddress?: string | null
  postcode?: string | null
}): ResolvedLocation {
  const rawMode = input.locationMode
  const hasSite = Boolean(input.siteId?.trim())
  let locationMode: LocationMode =
    rawMode === "MANAGED_SITE" || rawMode === "SINGLE_PROPERTY"
      ? (rawMode === "MANAGED_SITE" ? "MANAGED_SITE" : "ONE_OFF")
      : hasSite
        ? "MANAGED_SITE"
        : "ONE_OFF"

  // Managed site without siteId falls back to one-off so we never orphan a mode.
  if (locationMode === "MANAGED_SITE" && !hasSite) {
    locationMode = "ONE_OFF"
  }
  if (locationMode === "ONE_OFF") {
    // One-off jobs never keep a site relationship.
  }

  const siteId = locationMode === "MANAGED_SITE" ? (input.siteId!.trim()) : null
  const locationName = (
    input.locationName?.trim()
    || input.siteName?.trim()
    || ""
  ) || null
  const siteAddress = (
    input.siteAddress?.trim()
    || input.address?.trim()
    || ""
  ) || null
  const address = (
    input.address?.trim()
    || composeJobAddress(locationName, siteAddress)
    || ""
  )
  const postcode = extractPostcode(input.postcode, siteAddress, address)

  return {
    locationMode,
    siteId,
    locationName,
    address,
    postcode,
    siteName: locationName,
    siteAddress: siteAddress || address || null,
  }
}

export function locationDedupKey(opts: {
  clientId: string
  locationName?: string | null
  address?: string | null
  postcode?: string | null
}): string {
  const pc = normalizePostcode(opts.postcode)
  const name = (opts.locationName ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  const addr = (opts.address ?? "").trim().toLowerCase().replace(/\s+/g, " ")
  return `${opts.clientId}|${pc}|${name}|${addr}`
}
