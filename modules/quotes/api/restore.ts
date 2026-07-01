import { NextRequest, NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { quoteService } from "../services/quote-service"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!quote.archivedAt) return NextResponse.json({ error: "Quote is not archived" }, { status: 409 })

    const restored = await quoteService.restore(id, auth.user.id, auth.user.name)
    if (!restored) return NextResponse.json({ error: "Restore failed" }, { status: 500 })
    return NextResponse.json({ ok: true, quote: restored })
  } catch (err) {
    console.error("[POST /api/quotes/[id]/restore]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
