/**
 * GET /api/supabase/status
 *
 * Diagnostics for Supabase migration — env vars, all module tables, row counts,
 * and which modules are actively reading from Supabase at runtime.
 */
import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { buildSupabaseStatusReport } from "@/shared/supabase/status-report"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  const report = await buildSupabaseStatusReport()
  return NextResponse.json(report)
}
