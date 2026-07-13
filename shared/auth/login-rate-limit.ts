/**
 * Login attempt rate limiter.
 *
 * Uses Supabase when the service-role key is configured (shared across Vercel
 * instances). Falls back to in-memory for local SQLite-only development.
 */

import { createAdminClient } from "@/shared/supabase/admin"
import { isSupabaseAdminConfigured } from "@/shared/supabase/config"

export const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
export const LOGIN_RATE_MAX_ATTEMPTS = 10

type MemoryEntry = { count: number; resetAt: number }

const memoryAttempts = new Map<string, MemoryEntry>()

/** @internal — exposed for unit tests */
export function resetLoginRateLimitMemory(): void {
  memoryAttempts.clear()
}

function checkMemory(key: string): boolean {
  const now = Date.now()
  const entry = memoryAttempts.get(key)

  if (!entry || now > entry.resetAt) {
    memoryAttempts.set(key, { count: 1, resetAt: now + LOGIN_RATE_WINDOW_MS })
    return true
  }

  if (entry.count >= LOGIN_RATE_MAX_ATTEMPTS) return false

  entry.count++
  return true
}

async function checkSupabase(key: string): Promise<boolean> {
  const supabase = createAdminClient()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  const { data: existing, error: readError } = await supabase
    .from("login_rate_limits")
    .select("attempt_count, reset_at")
    .eq("rate_key", key)
    .maybeSingle()

  if (readError) {
    // Fail open to memory if the table is missing or unreachable — never
    // block legitimate logins because of a rate-limit store outage.
    console.warn("[login-rate-limit] supabase read failed, using memory:", readError.message)
    return checkMemory(key)
  }

  const resetAtMs = existing?.reset_at ? Date.parse(existing.reset_at) : 0
  const windowExpired = !existing || !Number.isFinite(resetAtMs) || now > resetAtMs

  if (windowExpired) {
    const resetAt = new Date(now + LOGIN_RATE_WINDOW_MS).toISOString()
    const { error: upsertError } = await supabase.from("login_rate_limits").upsert(
      { rate_key: key, attempt_count: 1, reset_at: resetAt },
      { onConflict: "rate_key" },
    )
    if (upsertError) {
      console.warn("[login-rate-limit] supabase upsert failed, using memory:", upsertError.message)
      return checkMemory(key)
    }
    return true
  }

  const count = Number(existing.attempt_count) || 0
  if (count >= LOGIN_RATE_MAX_ATTEMPTS) return false

  const { error: updateError } = await supabase
    .from("login_rate_limits")
    .update({ attempt_count: count + 1 })
    .eq("rate_key", key)
    .gt("reset_at", nowIso)

  if (updateError) {
    console.warn("[login-rate-limit] supabase update failed, using memory:", updateError.message)
    return checkMemory(key)
  }

  return true
}

/** Returns true if the attempt is allowed; false if the caller is rate-limited. */
export async function checkLoginRateLimit(key: string): Promise<boolean> {
  // Playwright / CI spin many parallel logins against one server — do not throttle.
  if (process.env.E2E === "true" || process.env.DISABLE_LOGIN_RATE_LIMIT === "true") {
    return true
  }

  if (isSupabaseAdminConfigured()) {
    try {
      return await checkSupabase(key)
    } catch (err) {
      console.warn(
        "[login-rate-limit] unexpected error, using memory:",
        err instanceof Error ? err.message : String(err),
      )
      return checkMemory(key)
    }
  }
  return checkMemory(key)
}

export async function remainingLoginAttempts(key: string): Promise<number> {
  if (!isSupabaseAdminConfigured()) {
    const entry = memoryAttempts.get(key)
    if (!entry || Date.now() > entry.resetAt) return LOGIN_RATE_MAX_ATTEMPTS
    return Math.max(0, LOGIN_RATE_MAX_ATTEMPTS - entry.count)
  }

  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("login_rate_limits")
      .select("attempt_count, reset_at")
      .eq("rate_key", key)
      .maybeSingle()

    if (!data?.reset_at || Date.now() > Date.parse(data.reset_at)) {
      return LOGIN_RATE_MAX_ATTEMPTS
    }
    return Math.max(0, LOGIN_RATE_MAX_ATTEMPTS - (Number(data.attempt_count) || 0))
  } catch {
    return LOGIN_RATE_MAX_ATTEMPTS
  }
}
