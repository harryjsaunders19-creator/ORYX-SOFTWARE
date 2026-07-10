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

/** OpenRouteService — free tier (2,000 requests/day). Requires ORS_API_KEY. */
async function routeViaOpenRouteService(from: RoutePoint, to: RoutePoint): Promise<SiteVisitRouteLeg> {
  const apiKey = process.env.ORS_API_KEY?.trim()
  if (!apiKey) throw new RoutingError("Routing is not configured (missing ORS_API_KEY)", "UNAVAILABLE")

  const url = "https://api.openrouteservice.org/v2/directions/driving-car"
  const res = await fetch(url, {
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
    if (res.status === 404 || res.status === 400) {
      throw new RoutingError("No driving route found between the office and this site", "NO_ROUTE")
    }
    throw new RoutingError("Routing service is temporarily unavailable — try again shortly", "UNAVAILABLE")
  }

  const data = await res.json() as {
    routes?: { summary?: { distance?: number; duration?: number } }[]
  }
  const summary = data.routes?.[0]?.summary
  if (!summary?.distance || summary.duration == null) {
    throw new RoutingError("No driving route found between the office and this site", "NO_ROUTE")
  }

  return {
    oneWayDistanceMiles: milesFromMetres(summary.distance),
    oneWayDurationMinutes: minutesFromSeconds(summary.duration),
  }
}

/**
 * OSRM public demo — no API key (suitable for low-volume internal use when ORS key absent).
 * https://project-osrm.org/ — not intended for heavy production load.
 */
async function routeViaOsrm(from: RoutePoint, to: RoutePoint): Promise<SiteVisitRouteLeg> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    throw new RoutingError("Routing service is temporarily unavailable — try again shortly", "UNAVAILABLE")
  }
  const data = await res.json() as {
    code?: string
    routes?: { distance?: number; duration?: number }[]
  }
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new RoutingError("No driving route found between the office and this site", "NO_ROUTE")
  }
  const route = data.routes[0]
  if (route.distance == null || route.duration == null) {
    throw new RoutingError("No driving route found between the office and this site", "NO_ROUTE")
  }
  return {
    oneWayDistanceMiles: milesFromMetres(route.distance),
    oneWayDurationMinutes: minutesFromSeconds(route.duration),
  }
}

export async function getDrivingRouteToSite(site: RoutePoint): Promise<SiteVisitRouteLeg> {
  const from = { lat: ORYX_OFFICE.lat, lng: ORYX_OFFICE.lng }
  if (
    Math.abs(site.lat - from.lat) < 0.0001
    && Math.abs(site.lng - from.lng) < 0.0001
  ) {
    return { oneWayDistanceMiles: 0, oneWayDurationMinutes: 0 }
  }

  if (process.env.ORS_API_KEY?.trim()) {
    return routeViaOpenRouteService(from, site)
  }
  return routeViaOsrm(from, site)
}
