/**
 * instrumentation.ts
 *
 * Next.js's supported hook for one-time server-startup logic (stable, no
 * config flag needed as of Next.js 15+). Used here only to start the daily
 * backup scheduler. Deliberately NOT used for the database schema
 * migrations — those already run as a side effect of importing lib/db.ts
 * the first time any API route touches it, which is the established
 * pattern throughout this codebase; this file doesn't change that.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return   // skip on the edge runtime — better-sqlite3 and the scheduler both need real Node

  // Fail the Vercel deploy loudly if required production secrets are missing.
  if (process.env.VERCEL === "1") {
    const { isSupabaseAdminConfigured } = await import("@/shared/supabase/config")
    if (!isSupabaseAdminConfigured()) {
      throw new Error(
        "VERCEL=1 but Supabase admin is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      )
    }
    if (!process.env.AUTH_SECRET?.trim()) {
      throw new Error("VERCEL=1 but AUTH_SECRET is not set — session cookies cannot be secured.")
    }
    if (!process.env.VAULT_ENCRYPTION_KEY?.trim()) {
      throw new Error("VERCEL=1 but VAULT_ENCRYPTION_KEY is not set — password vault cannot encrypt secrets.")
    }
    if (!process.env.ORS_API_KEY?.trim()) {
      const { logEvent } = await import("@/shared/logger")
      logEvent(
        "boot.ors_api_key_missing",
        {
          message:
            "ORS_API_KEY is unset — site visit routing falls back to public OSRM mirrors (often blocked from Vercel). Set a free OpenRouteService key for reliable routing.",
        },
        "warn",
      )
    }

    // Durable file uploads: never allow silent /tmp fallback on Vercel.
    const { assertVercelObjectStorageReady } = await import(
      "@/shared/storage/assert-vercel-object-storage"
    )
    await assertVercelObjectStorageReady()
  }

  const { isSupabaseOnly } = await import("@/shared/supabase/feature-flags")
  if (!isSupabaseOnly()) {
    const { startBackupScheduler } = await import("@/modules/backups/backup-scheduler")
    startBackupScheduler()
  }
  const { startQuoteExpiryScheduler } = await import("@/modules/quotes/quote-expiry-scheduler")
  startQuoteExpiryScheduler()
}
