import { NextResponse } from "next/server"
import { jobService } from "@/lib/services/job-service"
import { requireRole } from "@/shared/auth/auth"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"
import { DRAWING_SEQUENCE_KEY } from "@/lib/drawing-number"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const checks: Record<string, { ok: boolean; message: string; detail?: Record<string, unknown> | string | number | null }> = {}

  if (isSupabaseOnly()) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { count, error } = await createAdminClient()
        .from("jobs")
        .select("id", { count: "exact", head: true })
      if (error) throw error
      checks.database = {
        ok: true,
        message: `Connected — ${count ?? 0} job(s) in Supabase`,
        detail: { jobCount: count ?? 0 },
      }
    } catch (err) {
      checks.database = { ok: false, message: "Database error", detail: String(err) }
    }

    try {
      const total = await jobService.count()
      checks.read = { ok: true, message: `Read OK — ${total} job(s)` }
    } catch (err) {
      checks.read = { ok: false, message: "Read failed", detail: String(err) }
    }

    checks.write = {
      ok: true,
      message: "Write probe skipped (Supabase production — read-only health check)",
    }

    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { data, error } = await createAdminClient()
        .from("app_sequences")
        .select("value")
        .eq("name", DRAWING_SEQUENCE_KEY)
        .maybeSingle()
      if (error) throw error
      const seq = data?.value ?? null
      checks.sequence = {
        ok: typeof seq === "number",
        message:
          typeof seq === "number"
            ? `Drawing sequence readable (current: ${seq})`
            : "Sequence counter on Supabase (app_sequences) — not seeded yet",
        detail: { name: DRAWING_SEQUENCE_KEY, value: seq },
      }
      if (typeof seq !== "number") {
        // Missing row is acceptable until first allocate — still report ok for health.
        checks.sequence.ok = true
      }
    } catch (err) {
      checks.sequence = {
        ok: false,
        message: "Sequence read failed",
        detail: String(err),
      }
    }

    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { error } = await createAdminClient()
        .from("jobs")
        .select("list_sort_key")
        .limit(1)
      if (error && /list_sort_key/i.test(error.message)) {
        checks.listSortKey = {
          ok: false,
          message: "jobs.list_sort_key missing — run supabase/migrations/023_job_list_sort_key.sql",
          detail: error.message,
        }
      } else if (error) {
        throw error
      } else {
        checks.listSortKey = { ok: true, message: "list_sort_key column present" }
      }
    } catch (err) {
      checks.listSortKey = { ok: false, message: "list_sort_key probe failed", detail: String(err) }
    }

    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { error } = await createAdminClient().rpc("job_dashboard_counts")
      if (error && /job_dashboard_counts|function|does not exist|PGRST202/i.test(error.message)) {
        checks.jobDashboardCounts = {
          ok: false,
          message: "job_dashboard_counts RPC missing — apply dashboard counts migration",
          detail: error.message,
        }
      } else if (error) {
        throw error
      } else {
        checks.jobDashboardCounts = { ok: true, message: "job_dashboard_counts RPC available" }
      }
    } catch (err) {
      checks.jobDashboardCounts = {
        ok: false,
        message: "job_dashboard_counts probe failed",
        detail: String(err),
      }
    }

    try {
      const { createAdminClient } = await import("@/lib/supabase/admin")
      const { count, error } = await createAdminClient()
        .from("status_history")
        .select("id", { count: "exact", head: true })
      if (error) throw error
      checks.history = {
        ok: true,
        message: `StatusHistory OK — ${count ?? 0} event(s)`,
        detail: { historyCount: count ?? 0 },
      }
    } catch (err) {
      checks.history = { ok: false, message: "History table error", detail: String(err) }
    }
  } else {
    const { dbHealthCheck, sequenceDb } = await import("@/lib/db")

    try {
      const h = dbHealthCheck()
      checks.database = {
        ok: h.ok,
        message: h.ok ? `Connected — ${h.jobCount} job(s), ${h.historyCount} history event(s)` : "Connection failed",
        detail: { path: h.path, jobCount: h.jobCount, historyCount: h.historyCount },
      }
    } catch (err) {
      checks.database = { ok: false, message: "Database error", detail: String(err) }
    }

    try {
      const total = await jobService.count()
      checks.read = { ok: true, message: `Read OK — ${total} job(s)` }
    } catch (err) {
      checks.read = { ok: false, message: "Read failed", detail: String(err) }
    }

    try {
      const seq = sequenceDb.currentDrawingSequence()
      checks.write = {
        ok: typeof seq === "number",
        message: `Local store reachable (drawing sequence: ${seq})`,
      }
    } catch (err) {
      checks.write = { ok: false, message: "Store probe failed", detail: String(err) }
    }

    try {
      const seq = sequenceDb.currentDrawingSequence()
      checks.sequence = {
        ok: typeof seq === "number",
        message: `Drawing sequence readable (current: ${seq})`,
      }
    } catch (err) {
      checks.sequence = { ok: false, message: "Sequence read failed", detail: String(err) }
    }

    try {
      const h = dbHealthCheck()
      checks.history = { ok: true, message: `StatusHistory OK — ${h.historyCount} event(s)` }
    } catch (err) {
      checks.history = { ok: false, message: "History table error", detail: String(err) }
    }
  }

  const allOk = Object.values(checks).every(c => c.ok)
  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      time: new Date().toISOString(),
      runtime: { node: process.version, env: process.env.NODE_ENV },
    },
    { status: allOk ? 200 : 503 },
  )
}
