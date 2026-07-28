import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { typeOfWorksMigrationLogDb } from "@/lib/db"
import { requireRole } from "@/shared/auth/auth"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

export async function GET(req: NextRequest) {
  if (isSupabaseOnly() || process.env.VERCEL === "1") {
    return NextResponse.json({ error: "Not available in this environment" }, { status: 501 })
  }

  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const sp = req.nextUrl.searchParams
    const needsReviewParam = sp.get("needsReview")
    const needsReview = needsReviewParam === "true" ? true : needsReviewParam === "false" ? false : undefined
    const entries = typeOfWorksMigrationLogDb.findMany({ needsReview })
    const stats   = typeOfWorksMigrationLogDb.stats()
    return NextResponse.json({ entries, stats })
  } catch (err) {
    return apiInternalError("app.type-of-works-migration-log.route", err)
  }
}
