import { NextResponse } from "next/server"
import { quoteLineItemDb } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
  const { id } = await params
  const lineItems = quoteLineItemDb.findForQuote(id)
  return NextResponse.json({ lineItems })
}
