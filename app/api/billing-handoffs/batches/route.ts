import { NextResponse } from "next/server"
import { billingHandoffDb } from "@/lib/db"
import { requireRole } from "@/lib/auth"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const batches = billingHandoffDb.findBatches({ take: 100 })
    return NextResponse.json({ batches })
  } catch (err) {
    console.error("[GET /api/billing-handoffs/batches]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
