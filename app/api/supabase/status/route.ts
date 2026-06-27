/**
 * GET /api/supabase/status
 *
 * Checks whether Supabase env vars are set and the project is reachable.
 * Does NOT affect SQLite — safe to call anytime during migration setup.
 * Admin-only so we don't leak project details publicly.
 */
import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/supabaseClient"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const configured = isSupabaseConfigured()

  if (!configured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      message: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
      sqliteStillActive: true,
    })
  }

  // Ping Supabase with the anon key (no tables required)
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    })
    const connected = res.ok

    let clientsTableReady = false
    let clientCount: number | null = null
    let jobsTableReady = false
    let jobCount: number | null = null
    let quotesTableReady = false
    let quoteCount: number | null = null
    if (connected && isSupabaseAdminConfigured()) {
      try {
        const admin = createAdminClient()
        const clients = await admin.from("clients").select("*", { count: "exact", head: true })
        if (!clients.error) {
          clientsTableReady = true
          clientCount = clients.count
        }
        const jobs = await admin.from("jobs").select("*", { count: "exact", head: true })
        if (!jobs.error) {
          jobsTableReady = true
          jobCount = jobs.count
        }
        const quotes = await admin.from("quotes").select("*", { count: "exact", head: true })
        if (!quotes.error) {
          quotesTableReady = true
          quoteCount = quotes.count
        }
      } catch {
        clientsTableReady = false
        jobsTableReady = false
        quotesTableReady = false
      }
    }

    return NextResponse.json({
      configured: true,
      connected,
      clientsTableReady,
      clientCount,
      jobsTableReady,
      jobCount,
      quotesTableReady,
      quoteCount,
      sqliteStillActive: true,
      supabaseClientsEnabled: process.env.SUPABASE_CLIENTS === "true",
      supabaseJobsEnabled: process.env.SUPABASE_JOBS === "true",
      supabaseQuotesEnabled: process.env.SUPABASE_QUOTES === "true",
      url: url.replace(/^(https:\/\/[^.]+).*/, "$1.***.supabase.co"),
      message: connected
        ? quotesTableReady
          ? "Supabase connected. Clients, jobs, and quotes tables ready."
          : jobsTableReady
            ? "Supabase connected. Run supabase/migrations/003_quotes.sql next."
            : clientsTableReady
              ? "Supabase connected. Run supabase/migrations/002_jobs.sql next."
              : "Supabase connected. Run supabase/migrations/001_clients.sql in SQL Editor next."
        : "Env vars set but health check failed — verify URL and anon key.",
    })
  } catch (err) {
    return NextResponse.json({
      configured: true,
      connected: false,
      sqliteStillActive: true,
      message: "Could not reach Supabase",
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
