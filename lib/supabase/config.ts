/**
 * lib/supabase/config.ts
 *
 * Reads Supabase environment variables. The app still uses SQLite by default —
 * these vars are only needed once you start the Supabase migration.
 *
 * Nothing breaks if they are missing; isSupabaseConfigured() returns false.
 */

export function getSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined
}

export function getSupabaseAnonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined
}

/** True when both public Supabase vars are set (minimum to connect). */
export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseAnonKey())
}

/** True when the service-role key is set (server-only admin operations). */
export function isSupabaseAdminConfigured(): boolean {
  return isSupabaseConfigured() && !!getSupabaseServiceRoleKey()
}
