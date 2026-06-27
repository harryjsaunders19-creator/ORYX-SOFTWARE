/**
 * lib/supabase/server.ts
 *
 * Supabase client for Server Components, Server Actions, and API routes.
 * Uses cookies so it can share sessions with Supabase Auth later.
 *
 * Usage (future migration steps):
 *   const supabase = await createClient()
 *   const { data } = await supabase.from('clients').select('*')
 */
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "./config"

export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local — see .env.example.",
    )
  }

  const cookieStore = await cookies()

  return createServerClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // setAll can run from a Server Component where cookies are read-only —
          // safe to ignore; middleware or route handlers will refresh the session.
        }
      },
    },
  })
}
