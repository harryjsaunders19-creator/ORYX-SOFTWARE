import { NextResponse } from "next/server"
import { requireRole } from "@/shared/auth/auth"
import { jobService } from "@/lib/services/job-service"
import { quoteService } from "@/lib/services/quote-service"
import { clientService } from "@/lib/services/client-service"
import { attachCancelRecords } from "../cancel-record"
import { probeArchivedColumns, jobsArchivedAtAvailable, quotesArchivedAtAvailable } from "@/lib/supabase/archived-filter"
import { isSupabaseAdminConfigured } from "@/lib/supabase/config"
import { errorMessage } from "@/shared/utils/error-message"

export async function GET() {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    await probeArchivedColumns()

    const [jobs, quotes, clients] = await Promise.all([
      jobService.findArchived(),
      quoteService.findArchived(),
      clientService.findArchived(),
    ])

    const warnings: string[] = []
    if (isSupabaseAdminConfigured()) {
      if (!jobsArchivedAtAvailable()) {
        warnings.push("Jobs archive list requires archived_at on jobs (run 011_soft_delete.sql).")
      }
      if (!quotesArchivedAtAvailable()) {
        warnings.push("Quotes archive list requires archived_at on quotes (run 011_soft_delete.sql).")
      }
    }

    return NextResponse.json({
      jobs: await attachCancelRecords(jobs),
      quotes,
      clients,
      warnings,
    })
  } catch (err) {
    console.error("[GET /api/archived]", err)
    return NextResponse.json(
      { error: "Failed to load archived items", detail: errorMessage(err) },
      { status: 500 },
    )
  }
}
