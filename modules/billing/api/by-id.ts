import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiInternalError } from "@/shared/api-errors"

import { billingHandoffService } from "../services/billing-handoff-service"
import { requireFullAccess } from "@/shared/auth/auth"
import { parseOptionalMoney } from "@/shared/utils/utils"

type Ctx = { params: Promise<{ id: string }> }

const updateBillingValueBodySchema = z.object({
  quoteValue: z.union([z.string(), z.number(), z.null()]),
}).passthrough()

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const parsedBody = updateBillingValueBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as { quoteValue: unknown }

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
