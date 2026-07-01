/**
 * POST /api/quotes/[id]/pdf — generate quote PDF.
 * GET  /api/quotes/[id]/pdf — poll status, or stream PDF when ?download=1.
 */
import { NextResponse } from "next/server"
import { requireSignIn } from "@/shared/auth/auth"
import { quoteService } from "../services/quote-service"
import { buildQuotePdfBuffer, generateQuotePdf } from "../pdf/generate"
import { resolveQuotePdfUrl } from "../pdf/urls"

export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

    await quoteService.updatePdfPath(id, null)
    const { pdfPath } = await generateQuotePdf(id)

    return NextResponse.json({ status: "ready", pdfPath, quoteId: id })
  } catch (err) {
    console.error("[POST /api/quotes/[id]/pdf]", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const url = new URL(req.url)

    if (url.searchParams.get("download") === "1") {
      const quote = await quoteService.findUnique(id)
      if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

      const { pdfBytes, filename } = await buildQuotePdfBuffer(id)
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      })
    }

    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

    const pdfPath = resolveQuotePdfUrl(id, quote.pdfPath)
    if (pdfPath) {
      return NextResponse.json({ status: "ready", pdfPath })
    }
    return NextResponse.json({ status: "generating" })
  } catch (err) {
    console.error("[GET /api/quotes/[id]/pdf]", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
