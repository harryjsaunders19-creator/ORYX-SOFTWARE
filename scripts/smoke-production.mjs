/**
 * Production smoke check — hits /api/ping (and optionally /api/supabase/status).
 *
 * Usage:
 *   PRODUCTION_URL=https://oryx-software.vercel.app node scripts/smoke-production.mjs
 *
 * Exit 0 on success, 1 on failure.
 */
const base = (process.env.PRODUCTION_URL || process.env.SMOKE_URL || "").replace(/\/$/, "")

if (!base) {
  console.error("Set PRODUCTION_URL (e.g. https://oryx-software.vercel.app)")
  process.exit(1)
}

async function check(path, opts = {}) {
  const url = `${base}${path}`
  const started = Date.now()
  const res = await fetch(url, {
    method: "GET",
    headers: opts.headers,
    signal: AbortSignal.timeout(15_000),
  })
  const ms = Date.now() - started
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* plain */ }
  return { url, status: res.status, ms, json, text: text.slice(0, 200) }
}

console.log(`Smoke checking ${base}…\n`)

const ping = await check("/api/ping")
if (ping.status !== 200 || !ping.json?.ok) {
  console.error(`✗ GET /api/ping → ${ping.status} (${ping.ms}ms)`)
  console.error(ping.text)
  process.exit(1)
}
console.log(`✓ GET /api/ping → ${ping.status} (${ping.ms}ms)`)

// Unauthenticated — expect 401 (proves auth gate is up), not 500.
const jobs = await check("/api/jobs")
if (jobs.status !== 401) {
  console.error(`✗ GET /api/jobs (anon) expected 401, got ${jobs.status} (${jobs.ms}ms)`)
  console.error(jobs.text)
  process.exit(1)
}
console.log(`✓ GET /api/jobs (anon) → 401 (${jobs.ms}ms)`)

console.log("\nSmoke OK")
