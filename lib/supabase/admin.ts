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
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseServiceRoleKey, getSupabaseUrl, isSupabaseAdminConfigured } from "./config"

// Module-level singleton — reused across all requests in the same container.
// Creating a new client per-query added measurable overhead from the JS
// client setup (header parsing, realtime init, etc.).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: SupabaseClient<any, any, any> | null = null

export function createAdminClient() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "Supabase admin client is not configured. Add SUPABASE_SERVICE_ROLE_KEY " +
      "to .env.local (server-only, never commit) — see .env.example.",
    )
  }

  if (!_adminClient) {
    _adminClient = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return _adminClient
}
