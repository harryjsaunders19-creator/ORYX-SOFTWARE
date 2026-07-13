/**
 * Generic rate limiter (login + expensive API routes).
 *
 * Uses Supabase `login_rate_limits` when the service-role key is configured
 * (shared across Vercel instances). Falls back to in-memory for local
 * SQLite-only development. Keys are namespaced by caller (e.g. login:, pdf:).
 */

import { NextResponse } from "next/server"
import { createAdminClient } from "@/shared/supabase/admin"
import { isSupabaseAdminConfigured } from "@/shared/supabase/config"

export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
export const LOGIN_RATE_MAX_ATTEMPTS = 10

export type RateLimitOptions = {
  windowMs: number
  maxAttempts: number
}

type MemoryEntry = { count: number; resetAt: number }

const memoryAttempts = new Map<string, MemoryEntry>()

/** @internal — exposed for unit tests */
export function resetLoginRateLimitMemory(): void {
  memoryAttempts.clear()
}

/** @internal — alias for tests / generalized limiter */
export function resetRateLimitMemory(): void {
  memoryAttempts.clear()
}

function checkMemory(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now()
  const entry = memoryAttempts.get(key)

  if (!entry || now > entry.resetAt) {
    memoryAttempts.set(key, { count: 1, resetAt: now + opts.windowMs })
    return true
  }

  if (entry.count >= opts.maxAttempts) return false

  entry.count++
  return true
}

async function checkSupabase(key: string, opts: RateLimitOptions): Promise<boolean> {
  const supabase = createAdminClient()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  const { data: existing, error: readError } = await supabase
    .from("login_rate_limits")
    .select("attempt_count, reset_at")
    .eq("rate_key", key)
    .maybeSingle()

  if (readError) {
    console.warn("[rate-limit] supabase read failed, using memory:", readError.message)
    return checkMemory(key, opts)
  }

  const resetAtMs = existing?.reset_at ? Date.parse(existing.reset_at) : 0
  const windowExpired = !existing || !Number.isFinite(resetAtMs) || now > resetAtMs

  if (windowExpired) {
    const resetAt = new Date(now + opts.windowMs).toISOString()
    const { error: upsertError } = await supabase.from("login_rate_limits").upsert(
      { rate_key: key, attempt_count: 1, reset_at: resetAt },
      { onConflict: "rate_key" },
    )
    if (upsertError) {
      console.warn("[rate-limit] supabase upsert failed, using memory:", upsertError.message)
      return checkMemory(key, opts)
    }
    return true
  }

  const count = Number(existing.attempt_count) || 0
  if (count >= opts.maxAttempts) return false

  const { error: updateError } = await supabase
    .from("login_rate_limits")
    .update({ attempt_count: count + 1 })
    .eq("rate_key", key)
    .gt("reset_at", nowIso)

  if (updateError) {
    console.warn("[rate-limit] supabase update failed, using memory:", updateError.message)
    return checkMemory(key, opts)
  }

  return true
}

function bypassEnabled(): boolean {
  return process.env.E2E === "true" || process.env.DISABLE_LOGIN_RATE_LIMIT === "true"
}

/** Returns true if the attempt is allowed; false if rate-limited. */
export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<boolean> {
  if (bypassEnabled()) return true

  if (isSupabaseAdminConfigured()) {
    try {
      return await checkSupabase(key, opts)
    } catch (err) {
      console.warn(
        "[rate-limit] unexpected error, using memory:",
        err instanceof Error ? err.message : String(err),
      )
      return checkMemory(key, opts)
    }
  }
  return checkMemory(key, opts)
}

export async function remainingRateAttempts(key: string, opts: RateLimitOptions): Promise<number> {
  if (!isSupabaseAdminConfigured()) {
    const entry = memoryAttempts.get(key)
    if (!entry || Date.now() > entry.resetAt) return opts.maxAttempts
    return Math.max(0, opts.maxAttempts - entry.count)
  }

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("login_rate_limits")
      .select("attempt_count, reset_at")
      .eq("rate_key", key)
      .maybeSingle()

    if (!data?.reset_at || Date.now() > Date.parse(data.reset_at)) {
      return opts.maxAttempts
    }
    return Math.max(0, opts.maxAttempts - (Number(data.attempt_count) || 0))
  } catch {
    return opts.maxAttempts
  }
}

/** Login wrapper — same behaviour as before. */
export async function checkLoginRateLimit(key: string): Promise<boolean> {
  return checkRateLimit(`login:${key}`, {
    windowMs: LOGIN_RATE_WINDOW_MS,
    maxAttempts: LOGIN_RATE_MAX_ATTEMPTS,
  })
}

export async function remainingLoginAttempts(key: string): Promise<number> {
  return remainingRateAttempts(`login:${key}`, {
    windowMs: LOGIN_RATE_WINDOW_MS,
    maxAttempts: LOGIN_RATE_MAX_ATTEMPTS,
  })
}

export function rateLimitedResponse(retryAfterSec = 60): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  )
}

/** Preset budgets for expensive authenticated routes (keyed by user id). */
export const RATE_PRESETS = {
  pdf: { windowMs: 15 * 60 * 1000, maxAttempts: 20 },
  geocode: { windowMs: 60 * 60 * 1000, maxAttempts: 10 },
  mapSearch: { windowMs: 60 * 1000, maxAttempts: 60 },
  siteVisitCalc: { windowMs: 60 * 60 * 1000, maxAttempts: 30 },
  import: { windowMs: 60 * 60 * 1000, maxAttempts: 10 },
} as const
