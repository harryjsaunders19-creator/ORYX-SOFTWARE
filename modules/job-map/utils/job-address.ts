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

/** Prefer postal address for geocoding; only fall back to site name with region hint. */
export function buildGeocodeQuery(
  siteName: string | null | undefined,
  siteAddress: string | null | undefined,
  legacyAddress?: string,
): string {
  const addr = siteAddress?.trim()
  if (addr) return addr
  const name = siteName?.trim()
  if (name) return `${name}, United Kingdom`
  return legacyAddress?.trim() ?? ""
}

export function displaySiteName(
  siteName: string | null | undefined,
  address: string,
): string {
  if (siteName?.trim()) return siteName.trim()
  const first = address.split(",")[0]?.trim()
  return first || address || "—"
}
