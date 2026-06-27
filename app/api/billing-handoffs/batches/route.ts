import { NextResponse } from "next/server"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { requireRole } from "@/lib/auth"

export async function GET() {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const batches = await billingHandoffService.findBatches({ take: 100 })
    return NextResponse.json({ batches })
  } catch (err) {
    console.error("[GET /api/billing-handoffs/batches]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
