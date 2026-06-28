import { NextResponse } from "next/server"
import { quoteService } from "@/lib/services/quote-service"
import { requireSignIn } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth
  const { id } = await params
  const lineItems = await quoteService.findLineItemsForQuote(id)
  return NextResponse.json({ lineItems })
}
