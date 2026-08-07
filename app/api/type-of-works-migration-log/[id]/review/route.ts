import { NextRequest, NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { typeOfWorksMigrationLogDb } from "@/lib/db"
import { requireFullAccess, actorName } from "@/shared/auth/auth"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  if (isSupabaseOnly() || process.env.VERCEL === "1") {
    return NextResponse.json({ error: "Not available in this environment" }, { status: 501 })
  }

  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    // Body is optional; ignore client-supplied reviewedBy — use the signed-in user.
    try { await req.json() } catch { /* optional */ }
    const reviewedBy = actorName(auth.user)

    const updated = typeOfWorksMigrationLogDb.markReviewed(id, reviewedBy)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    return apiInternalError("app.type-of-works-migration-log.id.review.route", err)
  }
}
