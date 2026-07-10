import { DEFAULT_SITE_HOURS } from "../constants"
import type { SiteVisitCalculationInput, SaveSiteVisitInput } from "../types"
import { validateSiteHours } from "../services/calculator-math"

type ParseResult<T> = { data: T } | { error: string }

function optNumber(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

export function parseCalculateBody(body: Record<string, unknown>): ParseResult<SiteVisitCalculationInput> {
  const siteAddress = typeof body.siteAddress === "string" ? body.siteAddress.trim() : ""
  if (!siteAddress) return { error: "Enter a site address or postcode" }

  const siteHours = optNumber(body.siteHours) ?? DEFAULT_SITE_HOURS
  const hoursError = validateSiteHours(siteHours)
  if (hoursError) return { error: hoursError }

  return {
    data: {
      siteAddress,
      siteLat: optNumber(body.siteLat),
      siteLng: optNumber(body.siteLng),
      siteHours,
    },
  }
}

export function parseSaveBody(
  body: Record<string, unknown>,
): ParseResult<SaveSiteVisitInput & { label?: string | null }> {
  const result = body.result
  if (!result || typeof result !== "object") return { error: "Calculation result is required" }

  const r = result as Record<string, unknown>
  const siteAddress = typeof r.siteAddress === "string" ? r.siteAddress.trim() : ""
  if (!siteAddress) return { error: "Invalid calculation data" }

  const siteHours = optNumber(r.siteHours)
  if (siteHours == null) return { error: "Invalid calculation data" }

  const label = typeof body.label === "string" ? body.label.trim() || null : null

  return {
    data: {
      label,
      result: r as unknown as SaveSiteVisitInput["result"],
    },
  }
}
