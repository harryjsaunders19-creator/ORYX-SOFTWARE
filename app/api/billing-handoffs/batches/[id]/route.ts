import { NextResponse } from "next/server"
import { billingHandoffDb } from "@/lib/db"
import { requireRole } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const batch = billingHandoffDb.findBatchUnique(id)
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const handoffs = billingHandoffDb.handoffsForBatch(id)
    return NextResponse.json({ batch, handoffs })
  } catch (err) {
    console.error("[GET /api/billing-handoffs/batches/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
