import { ORYX_OFFICE } from "../constants"
import { milesFromMetres, minutesFromSeconds } from "./calculator-math"
import type { SiteVisitRouteLeg } from "../types"

export class RoutingError extends Error {
  constructor(
    message: string,
    readonly code: "NO_ROUTE" | "UNAVAILABLE" | "INVALID" = "UNAVAILABLE",
  ) {
    super(message)
    this.name = "RoutingError"
  }
}

interface RoutePoint {
  lat: number
  lng: number
}

type RouteAttemptFailure = {
  provider: string
  status?: number
  detail: string
}

function hasOrsKey(): boolean {
  return Boolean(process.env.ORS_API_KEY?.trim())
}

async function readErrorSnippet(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text.replace(/\s+/g, " ").trim().slice(0, 180)
  } catch {
    return ""
  }
}

function legFromMetresSeconds(distanceM: number, durationS: number): SiteVisitRouteLeg {
  return {
    oneWayDistanceMiles: milesFromMetres(distanceM),
    oneWayDurationMinutes: minutesFromSeconds(durationS),
  }
}

/** OpenRouteService — free tier (~2,000 requests/day). Requires ORS_API_KEY. */
async function routeViaOpenRouteService(
  from: RoutePoint,
  to: RoutePoint,
): Promise<SiteVisitRouteLeg | RouteAttemptFailure> {
  const apiKey = process.env.ORS_API_KEY?.trim()
  if (!apiKey) {
    return { provider: "openrouteservice", detail: "ORS_API_KEY missing" }
  }

  try {
    const res = await fetch("https://api.openrouteservice.org/v2/directions/driving-car", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const snippet = await readErrorSnippet(res)
      if (res.status === 404 || res.status === 400) {
        throw new RoutingError("No driving route found between the office and this site", "NO_ROUTE")
      }
      if (res.status === 401 || res.status === 403) {
        throw new RoutingError(
          "Routing API key is invalid or blocked — check ORS_API_KEY in environment settings",
          "UNAVAILABLE",
        )
      }
      if (res.status === 429) {
        return {
          provider: "openrouteservice",
          status: 429,
          detail: snippet || "rate limited",
        }
      }
      return {
        provider: "openrouteservice",
        status: res.status,
        detail: snippet || res.statusText || "request failed",
      }
    }

    const data = await res.json() as {
      routes?: { summary?: { distance?: number; duration?: number } }[]
    }
    const summary = data.routes?.[0]?.summary
    if (summary?.distance == null || summary.duration == null) {
      throw new RoutingError("No driving route found between the office and this site", "NO_ROUTE")
    }
    return legFromMetresSeconds(summary.distance, summary.duration)
  } catch (err) {
    if (err instanceof RoutingError) throw err
    const msg = err instanceof Error ? err.message : "network error"
    return { provider: "openrouteservice", detail: msg }
  }
}

const OSRM_ENDPOINTS = [
  "https://router.project-osrm.org",
  "https://routing.openstreetmap.de/routed-car",
] as const

/** Public OSRM mirrors — used when ORS is unset or unavailable. */
async function routeViaOsrm(
  from: RoutePoint,
  to: RoutePoint,
): Promise<SiteVisitRouteLeg | RouteAttemptFailure[]> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const failures: RouteAttemptFailure[] = []

  for (const base of OSRM_ENDPOINTS) {
    const url = `${base}/route/v1/driving/${coords}?overview=false`
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        failures.push({
          provider: `osrm:${new URL(base).host}`,
          status: res.status,
          detail: await readErrorSnippet(res) || res.statusText,
        })
        continue
      }
      const data = await res.json() as {
        code?: string
        routes?: { distance?: number; duration?: number }[]
      }
      if (data.code !== "Ok" || !data.routes?.[0]) {
        failures.push({
          provider: `osrm:${new URL(base).host}`,
          detail: `code=${data.code ?? "unknown"}`,
        })
        continue
      }
      const route = data.routes[0]
      if (route.distance == null || route.duration == null) {
        failures.push({
          provider: `osrm:${new URL(base).host}`,
          detail: "missing distance/duration",
        })
        continue
      }
      return legFromMetresSeconds(route.distance, route.duration)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error"
      failures.push({ provider: `osrm:${new URL(base).host}`, detail: msg })
    }
  }

  return failures
}

function isRouteLeg(value: SiteVisitRouteLeg | RouteAttemptFailure | RouteAttemptFailure[]): value is SiteVisitRouteLeg {
  return typeof value === "object" && value !== null && "oneWayDistanceMiles" in value
}

export async function getDrivingRouteToSite(site: RoutePoint): Promise<SiteVisitRouteLeg> {
  const from = { lat: ORYX_OFFICE.lat, lng: ORYX_OFFICE.lng }
  if (
    Math.abs(site.lat - from.lat) < 0.0001
    && Math.abs(site.lng - from.lng) < 0.0001
  ) {
    return { oneWayDistanceMiles: 0, oneWayDurationMinutes: 0 }
  }

  const failures: RouteAttemptFailure[] = []

  if (hasOrsKey()) {
    try {
      const ors = await routeViaOpenRouteService(from, site)
      if (isRouteLeg(ors)) return ors
      failures.push(ors)
    } catch (err) {
      // Genuine "no road between points" — don't waste fallbacks claiming unavailable.
      if (err instanceof RoutingError && err.code === "NO_ROUTE") throw err
      if (err instanceof RoutingError) {
        failures.push({ provider: "openrouteservice", detail: err.message })
      } else {
        failures.push({
          provider: "openrouteservice",
          detail: err instanceof Error ? err.message : "failed",
        })
      }
    }
  }

  const osrm = await routeViaOsrm(from, site)
  if (isRouteLeg(osrm)) return osrm
  failures.push(...osrm)

  if (typeof console !== "undefined") {
    console.warn("[site-visit-routing] all providers failed", failures)
  }

  if (!hasOrsKey()) {
    throw new RoutingError(
      "Routing service is unavailable. Set ORS_API_KEY (free key from openrouteservice.org) in your environment, then retry.",
      "UNAVAILABLE",
    )
  }

  throw new RoutingError(
    "Routing service is temporarily unavailable — try again shortly",
    "UNAVAILABLE",
  )
}
