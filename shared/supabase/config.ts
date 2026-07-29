/**
 * shared/supabase/config.ts
 *
 * Reads Supabase environment variables.
 *
 * Local/CI: omit `SUPABASE_SERVICE_ROLE_KEY` → SQLite (`isSupabaseOnly()` false).
 * Production: set URL + anon + service-role → Supabase-only routers.
 * See docs/sqlite-sunset.md.
 *
 * Nothing breaks if they are missing; isSupabaseConfigured() returns false.
 */

export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    undefined
  )
}

/** Anon / publishable key — Vercel integration syncs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. */
export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    undefined
  )
}

/** Service role / secret key — Vercel integration syncs SUPABASE_SECRET_KEY. */
export function getSupabaseServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    undefined
  )
}

/** True when both public Supabase vars are set (minimum to connect). */
export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseAnonKey())
}

/** True when the service-role key is set (server-only admin operations). */
export function isSupabaseAdminConfigured(): boolean {
  return isSupabaseConfigured() && !!getSupabaseServiceRoleKey()
}
