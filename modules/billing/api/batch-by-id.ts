import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { billingHandoffService } from "../services/billing-handoff-service"
import { requireRole, requireFullAccess } from "@/shared/auth/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const batch = await billingHandoffService.findBatchUnique(id)
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const handoffs = await billingHandoffService.handoffsForBatch(id)
    return NextResponse.json({ batch, handoffs })
  } catch (err) {
    return apiInternalError("billing.api.batch-by-id", err)
  }
}
