import { NextResponse } from "next/server"

/**
 * Auth-gated JSON APIs must not use browser HTTP caching — SWR handles
 * client-side stale-while-revalidate. A max-age on list routes caused
 * create/archive/delete to show stale data for ~5s after mutate().
 */
export function listResponse(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate")
  return res
}

export function resourceResponse(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate")
  return res
}
