/**
 * POST /api/quotes/[id]/pdf — generate quote PDF.
 * GET  /api/quotes/[id]/pdf — poll status, or stream PDF when ?download=1.
 */
import { NextResponse } from "next/server"
import { apiInternalError } from "@/shared/api-errors"

import { requireSignIn } from "@/shared/auth/auth"
import { quoteService } from "../services/quote-service"
import { buildQuotePdfBuffer, generateQuotePdf } from "../pdf/generate"
import { getCachedQuotePdf, setCachedQuotePdf, invalidateQuotePdf } from "../pdf/cache"
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
    invalidateQuotePdf(id)
    const { pdfPath } = await generateQuotePdf(id)

    return NextResponse.json({ status: "ready", pdfPath, quoteId: id })
  } catch (err) {
    return apiInternalError("quotes.api.pdf.post", err)
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

      const cached = getCachedQuotePdf(id, quote.updatedAt)
      if (cached) {
        return new NextResponse(Buffer.from(cached.pdfBytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${cached.filename}"`,
            "Cache-Control": "private, max-age=3600",
          },
        })
      }

      const { pdfBytes, filename } = await buildQuotePdfBuffer(id)
      setCachedQuotePdf(id, quote.updatedAt, pdfBytes, filename)
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "private, max-age=3600",
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
    return apiInternalError("quotes.api.pdf.get", err)
  }
}
