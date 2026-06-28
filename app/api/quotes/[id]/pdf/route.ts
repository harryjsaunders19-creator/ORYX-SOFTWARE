/**
 * POST /api/quotes/[id]/pdf — queues PDF generation and returns immediately.
 * Generation runs in the background via next/server `after()`.
 */
import { after } from "next/server"
import { NextResponse } from "next/server"
import { requireSignIn } from "@/lib/auth"
import { quoteService } from "@/lib/services/quote-service"
import { generateQuotePdf } from "@/lib/quote-pdf/generate"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

    // Clear stale path so GET polling reflects in-progress regeneration.
    await quoteService.update(id, { pdfPath: null })

    after(async () => {
      try {
        await generateQuotePdf(id)
      } catch (err) {
        console.error("[POST /api/quotes/[id]/pdf] background generation failed:", err)
      }
    })

    return NextResponse.json({ status: "generating", quoteId: id }, { status: 202 })
  } catch (err) {
    console.error("[POST /api/quotes/[id]/pdf]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** GET — poll generation status; returns pdfPath when ready. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

    if (quote.pdfPath) {
      return NextResponse.json({ status: "ready", pdfPath: quote.pdfPath })
    }
    return NextResponse.json({ status: "generating" })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
