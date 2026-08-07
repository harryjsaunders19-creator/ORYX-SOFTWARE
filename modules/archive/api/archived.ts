import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireFullAccess } from "@/shared/auth/auth"
import { jobService } from "@/modules/jobs"
import { quoteService } from "@/modules/quotes"
import { clientService } from "@/modules/clients"
import { attachCancelRecords } from "../cancel-record"
import { probeArchivedColumns, jobsArchivedAtAvailable, quotesArchivedAtAvailable } from "@/shared/supabase/archived-filter"
import { isSupabaseAdminConfigured } from "@/shared/supabase/config"

export async function GET() {
  try {
    const auth = await requireFullAccess()
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
    return apiInternalError("archive.api.archived", err)
  }
}
