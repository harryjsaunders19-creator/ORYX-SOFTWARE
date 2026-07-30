/**
 * Normalisation helpers for site duplicate detection and search keys.
 * Compare casing, whitespace, postcode spacing, and light punctuation.
 */

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeName(value: string | null | undefined): string {
  if (!value) return ""
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.,/#'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** UK-style postcode: strip spaces and uppercase. */
export function normalizePostcode(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/\s+/g, "").toUpperCase()
}

export function normalizeAddressLine(value: string | null | undefined): string {
  if (!value) return ""
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[.,/#'"`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Composite key used to group legacy jobs into candidate sites. */
export function siteDedupKey(opts: {
  clientId: string
  name: string | null | undefined
  addressLine1?: string | null
  postcode?: string | null
  siteAddress?: string | null
}): string {
  const name = normalizeName(opts.name)
  const postcode = normalizePostcode(opts.postcode)
  const line = normalizeAddressLine(opts.addressLine1)
    || normalizeAddressLine(opts.siteAddress)
  return `${opts.clientId}|${name}|${postcode}|${line}`
}

/** Format structured site address into a single display / denormalized string. */
export function formatSiteAddress(site: {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  county?: string | null
  postcode?: string | null
  country?: string | null
}): string {
  const parts = [
    site.addressLine1,
    site.addressLine2,
    site.city,
    site.county,
    site.postcode,
    site.country && site.country !== "United Kingdom" ? site.country : null,
  ]
    .map(p => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
  return parts.join(", ")
}

/** Best-effort parse of a free-text site address into structured fields. */
export function parseLegacySiteAddress(raw: string | null | undefined): {
  addressLine1: string | null
  city: string | null
  postcode: string | null
} {
  const text = normalizeWhitespace(raw ?? "")
  if (!text) return { addressLine1: null, city: null, postcode: null }

  const postcodeMatch = text.match(
    /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i,
  )
  const postcode = postcodeMatch ? postcodeMatch[1].toUpperCase().replace(/\s+/g, " ").trim() : null

  let withoutPostcode = text
  if (postcodeMatch) {
    withoutPostcode = normalizeWhitespace(
      text.slice(0, postcodeMatch.index) + text.slice(postcodeMatch.index! + postcodeMatch[0].length),
    ).replace(/,\s*$/, "")
  }

  const segments = withoutPostcode.split(",").map(s => s.trim()).filter(Boolean)
  if (segments.length === 0) {
    return { addressLine1: text, city: null, postcode }
  }
  if (segments.length === 1) {
    return { addressLine1: segments[0], city: null, postcode }
  }
  const city = segments[segments.length - 1] || null
  const addressLine1 = segments.slice(0, -1).join(", ") || segments[0]
  return { addressLine1, city, postcode }
}

/** Score how similar two site candidates are (0–1). */
export function siteSimilarity(
  a: { name: string; addressLine1?: string | null; postcode?: string | null },
  b: { name: string; addressLine1?: string | null; postcode?: string | null },
): number {
  const nameA = normalizeName(a.name)
  const nameB = normalizeName(b.name)
  if (!nameA || !nameB) return 0

  let score = 0
  if (nameA === nameB) score += 0.55
  else if (nameA.includes(nameB) || nameB.includes(nameA)) score += 0.35

  const pcA = normalizePostcode(a.postcode)
  const pcB = normalizePostcode(b.postcode)
  if (pcA && pcB && pcA === pcB) score += 0.3

  const lineA = normalizeAddressLine(a.addressLine1)
  const lineB = normalizeAddressLine(b.addressLine1)
  if (lineA && lineB) {
    if (lineA === lineB) score += 0.15
    else if (lineA.includes(lineB) || lineB.includes(lineA)) score += 0.1
  }

  return Math.min(1, score)
}
