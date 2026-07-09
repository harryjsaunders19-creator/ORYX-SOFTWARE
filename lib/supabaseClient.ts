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
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from "@/shared/supabase/config"

export { isSupabaseConfigured }

/**
 * Creates a Supabase client using the public anon key.
 * Safe for browser and server code (never put the service-role key here).
 *
 * @throws if Supabase URL or anon/publishable key is missing
 */
export function createSupabaseClient(): SupabaseClient {
  const url = getSupabaseUrl()
  const anonKey = getSupabaseAnonKey()

  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from the Vercel integration) " +
      "to .env.local (see .env.example).",
    )
  }

  return createClient(url, anonKey)
}
