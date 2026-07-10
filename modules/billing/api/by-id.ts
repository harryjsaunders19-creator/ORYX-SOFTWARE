import { NextRequest, NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { billingHandoffService } from "../services/billing-handoff-service"
import { requireRole } from "@/shared/auth/auth"
import { parseOptionalMoney } from "@/shared/utils/utils"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    if (body.quoteValue === undefined) {
      return NextResponse.json({ error: "quoteValue is required" }, { status: 400 })
    }

    const parsed = parseOptionalMoney(body.quoteValue)
    if (parsed == null) {
      return NextResponse.json({ error: "Enter a valid amount" }, { status: 422 })
    }

    const result = await billingHandoffService.updateQuoteValue(id, parsed)
    if ("error" in result) {
      const status = result.error === "Not found" ? 404 : 422
      return NextResponse.json({ error: result.error }, { status })
    }

    return NextResponse.json({ handoff: result })
  } catch (err) {
    return apiInternalError("billing.api.by-id", err)
  }
}
