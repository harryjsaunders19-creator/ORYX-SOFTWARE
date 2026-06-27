/**
 * lib/supabase/admin.ts
 *
 * Service-role client — bypasses Row Level Security. Use ONLY in trusted
 * server code (API routes, scripts). NEVER import this in Client Components
 * or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
 *
 * Usage (future migration / seed scripts):
 *   const supabase = createAdminClient()
 *   await supabase.from('clients').insert({ ... })
 */
import { createClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl, isSupabaseAdminConfigured } from "./config"

export function createAdminClient() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "Supabase admin client is not configured. Add SUPABASE_SERVICE_ROLE_KEY " +
      "to .env.local (server-only, never commit) — see .env.example.",
    )
  }

  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
