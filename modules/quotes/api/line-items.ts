import { NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { quoteService } from "../services/quote-service"
import { requireSignIn } from "@/shared/auth/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const lineItems = await quoteService.findLineItemsForQuote(id)
    return NextResponse.json({ lineItems })
  } catch (err) {
    return apiInternalError("quotes.api.line-items", err)
  }
}
