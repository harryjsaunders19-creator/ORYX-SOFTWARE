/**
 * lib/supabaseClient.ts
 *
 * Reusable Supabase client for this project.
 * Reads credentials from environment variables — see .env.example.
 *
 * NOTE: The app still uses SQLite (lib/db) for all live data.
 *       This file only prepares the Supabase connection for future migration steps.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/** True when both public Supabase env vars are set in .env.local */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  )
}

/**
 * Creates a Supabase client using the public anon key.
 * Safe for browser and server code (never put the service-role key here).
 *
 * @throws if NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing
 */
export function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see .env.example).",
    )
  }

  return createClient(url, anonKey)
}
