import { NextRequest, NextResponse } from "next/server"
import { typeOfWorksMigrationLogDb } from "@/lib/db"
import { requireRole } from "@/lib/auth"

export async function GET(req: NextRequest) {
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
    console.error("[GET /api/type-of-works-migration-log]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
