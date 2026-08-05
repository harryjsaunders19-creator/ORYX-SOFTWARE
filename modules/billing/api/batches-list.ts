import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { billingHandoffService } from "../services/billing-handoff-service"
import { requireRole, requireFullAccess } from "@/shared/auth/auth"

export async function GET() {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const batches = await billingHandoffService.findBatches({ take: 100 })
    return NextResponse.json({ batches })
  } catch (err) {
    return apiInternalError("billing.api.batches-list", err)
  }
}
