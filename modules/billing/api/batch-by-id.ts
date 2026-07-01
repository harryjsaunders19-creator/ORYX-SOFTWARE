import { NextResponse } from "next/server"
import { billingHandoffService } from "../services/billing-handoff-service"
import { requireRole } from "@/shared/auth/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const batch = await billingHandoffService.findBatchUnique(id)
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const handoffs = await billingHandoffService.handoffsForBatch(id)
    return NextResponse.json({ batch, handoffs })
  } catch (err) {
    console.error("[GET /api/billing-handoffs/batches/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
