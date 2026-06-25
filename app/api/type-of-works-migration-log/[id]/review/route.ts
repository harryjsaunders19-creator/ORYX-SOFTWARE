import { NextRequest, NextResponse } from "next/server"
import { typeOfWorksMigrationLogDb } from "@/lib/db"
import { requireRole } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* optional */ }
    const reviewedBy = body.reviewedBy ? String(body.reviewedBy) : "System"

    const updated = typeOfWorksMigrationLogDb.markReviewed(id, reviewedBy)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err) {
    console.error("[POST /api/type-of-works-migration-log/[id]/review]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
