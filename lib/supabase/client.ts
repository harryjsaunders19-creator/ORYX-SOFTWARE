/**
 * lib/supabase/client.ts
 *
 * Supabase client for Client Components ("use client" files).
 *
 * Usage (future migration steps):
 *   const supabase = createClient()
 *   const { data } = await supabase.from('clients').select('*')
 */
import { createBrowserClient } from "@supabase/ssr"
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./config"

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local — see .env.example.",
    )
  }

  return createBrowserClient(getSupabaseUrl()!, getSupabaseAnonKey()!)
}
