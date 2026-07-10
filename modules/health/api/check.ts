import { NextResponse } from "next/server"
import { dbHealthCheck, sequenceDb } from "@/lib/db"
import { jobService } from "@/lib/services/job-service"
import { requireRole } from "@/shared/auth/auth"
import { isSupabaseOnly } from "@/lib/supabase/feature-flags"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const checks: Record<string, { ok: boolean; message: string; detail?: Record<string, unknown> | string | number | null }> = {}

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
    if (isSupabaseOnly()) {
      checks.write = {
        ok: true,
        message: "Write probe skipped (Supabase production — read-only health check)",
      }
    } else {
      const seq = sequenceDb.currentDrawingSequence()
      checks.write = {
        ok: typeof seq === "number",
        message: `Local store reachable (drawing sequence: ${seq})`,
      }
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
    checks.sequence = {
      ok: isSupabaseOnly(),
      message: isSupabaseOnly()
        ? "Sequence counter on Supabase (app_sequences)"
        : "Sequence read failed",
      detail: isSupabaseOnly() ? undefined : String(err),
    }
  }

  try {
    const h = dbHealthCheck()
    checks.history = { ok: true, message: `StatusHistory OK — ${h.historyCount} event(s)` }
  } catch (err) {
    checks.history = { ok: false, message: "History table error", detail: String(err) }
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
