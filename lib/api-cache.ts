import { NextResponse } from "next/server"

/**
 * Adds Cache-Control: private, max-age=5, stale-while-revalidate=60
 *
 * - `private` — browser only (not CDN), required because routes use auth cookies
 * - `max-age=5` — serve from cache for the first 5 seconds without any network request
 * - `stale-while-revalidate=60` — after 5 s, return cached data immediately and
 *   refetch in the background. Makes page revisits feel instant.
 */
export function listResponse(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=60")
  return res
}

/**
 * Like listResponse but for individual resource GET endpoints (job, client,
 * quote detail pages). Single records change less often than paginated lists
 * so we can afford a slightly wider stale window.
 */
export function resourceResponse(body: unknown, status = 200): NextResponse {
  const res = NextResponse.json(body, { status })
  res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=120")
  return res
}
