/**
 * GET /api/supabase/status
 *
 * Diagnostics for Supabase migration — env vars, table readiness, row counts,
 * and which modules are actively reading from Supabase at runtime.
 */
import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/supabaseClient"
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/config"
import { createAdminClient } from "@/lib/supabase/admin"
import { supabaseModuleFlags } from "@/lib/supabase/feature-flags"

async function tableCount(table: string): Promise<{ ready: boolean; count: number | null; error?: string }> {
  try {
    const { count, error } = await createAdminClient()
      .from(table)
      .select("*", { count: "exact", head: true })
    if (error) return { ready: false, count: null, error: error.message }
    return { ready: true, count: count ?? 0 }
  } catch (err) {
    return { ready: false, count: null, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const urlSet = !!getSupabaseUrl()
  const anonSet = !!getSupabaseAnonKey()
  const serviceRoleSet = !!getSupabaseServiceRoleKey()
  const configured = isSupabaseConfigured()
  const adminConfigured = isSupabaseAdminConfigured()
  const modules = supabaseModuleFlags()

  const issues: string[] = []

  if (!urlSet) issues.push("Missing NEXT_PUBLIC_SUPABASE_URL")
  if (!anonSet) issues.push("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY")
  if (!serviceRoleSet) {
    issues.push(
      "Missing SUPABASE_SERVICE_ROLE_KEY — the app cannot read/write Supabase from API routes without it (anon key alone is not enough).",
    )
  }

  if (!configured) {
    return NextResponse.json({
      configured: false,
      connected: false,
      adminConfigured,
      serviceRoleSet,
      modules,
      issues,
      message: "Supabase public env vars are not fully set.",
      sqliteStillActive: true,
    })
  }

  try {
    const url = getSupabaseUrl()!
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: getSupabaseAnonKey()! },
    })
    const connected = res.ok

    if (!connected) {
      issues.push("Supabase health check failed — verify URL and anon key.")
    }

    let clients: { ready: boolean; count: number | null; error?: string } = { ready: false, count: null }
    let jobs: { ready: boolean; count: number | null; error?: string } = { ready: false, count: null }
    let quotes: { ready: boolean; count: number | null; error?: string } = { ready: false, count: null }
    let billingHandoffs: { ready: boolean; count: number | null; error?: string } = { ready: false, count: null }

    if (connected && adminConfigured) {
      ;[clients, jobs, quotes, billingHandoffs] = await Promise.all([
        tableCount("clients"),
        tableCount("jobs"),
        tableCount("quotes"),
        tableCount("billing_handoffs"),
      ])

      // archived_at columns (011_soft_delete.sql) — stats breaks without these
      try {
        const { error: archErr } = await createAdminClient()
          .from("jobs")
          .select("archived_at")
          .limit(1)
        if (archErr && /archived_at/i.test(archErr.message)) {
          issues.push(
            "Missing archived_at on jobs — run supabase/migrations/011_soft_delete.sql in Supabase SQL Editor (this breaks the dashboard).",
          )
        }
      } catch { /* ignore */ }

      if (!clients.ready) issues.push(`clients table: ${clients.error ?? "not found"} — run 001_clients.sql`)
      if (!jobs.ready) issues.push(`jobs table: ${jobs.error ?? "not found"} — run 002_jobs.sql`)
      if (!quotes.ready) issues.push(`quotes table: ${quotes.error ?? "not found"} — run 003_quotes.sql`)
      if (!billingHandoffs.ready) issues.push(`billing_handoffs table: ${billingHandoffs.error ?? "not found"} — run 006_billing.sql`)

      if (jobs.ready && (jobs.count ?? 0) === 0) {
        issues.push("Supabase jobs table is empty — run npm run supabase:sync-jobs from a machine with your SQLite data (or create jobs in the app after deploy).")
      }
      if (billingHandoffs.ready && (billingHandoffs.count ?? 0) === 0 && modules.billing) {
        issues.push("Supabase billing_handoffs is empty — completed/issued jobs sync here via npm run supabase:sync-billing.")
      }
    }

    if (configured && !adminConfigured) {
      issues.push("Only anon key is set — add SUPABASE_SERVICE_ROLE_KEY on Vercel for server-side reads.")
    }

    const maskedUrl = url.replace(/^(https:\/\/[^.]+).*/, "$1.***.supabase.co")

    return NextResponse.json({
      configured: true,
      connected,
      adminConfigured,
      serviceRoleSet,
      onVercel: !!process.env.VERCEL,
      modules,
      clientsTableReady: clients.ready,
      clientCount: clients.count,
      jobsTableReady: jobs.ready,
      jobCount: jobs.count,
      quotesTableReady: quotes.ready,
      quoteCount: quotes.count,
      billingTableReady: billingHandoffs.ready,
      billingHandoffCount: billingHandoffs.count,
      issues,
      sqliteStillActive: !adminConfigured || !modules.jobs,
      url: maskedUrl,
      message: issues.length
        ? issues[0]
        : connected
          ? `Supabase connected — ${jobs.count ?? 0} job(s), ${billingHandoffs.count ?? 0} billing handoff(s).`
          : "Env vars set but health check failed.",
    })
  } catch (err) {
    return NextResponse.json({
      configured: true,
      connected: false,
      adminConfigured,
      serviceRoleSet,
      modules,
      issues: [...issues, err instanceof Error ? err.message : String(err)],
      sqliteStillActive: true,
      message: "Could not reach Supabase",
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
