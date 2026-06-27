import { NextRequest, NextResponse } from "next/server"
import { quoteService } from "@/lib/services/quote-service"
import { getCurrentUser } from "@/lib/auth"

interface LineItemInput { description?: unknown; amount?: unknown; vatApplicable?: unknown }

function parseLineItems(raw: unknown): { description: string; amount: number; vatApplicable: boolean }[] {
  if (!Array.isArray(raw)) return []
  return (raw as LineItemInput[])
    .filter(li => li && typeof li.description === "string" && li.description.trim())
    .map(li => ({
      description: String(li.description).trim(),
      amount: Math.round((parseFloat(String(li.amount ?? "0")) || 0) * 100) / 100,
      vatApplicable: li.vatApplicable !== false,
    }))
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

  const { id } = await params
  const quote  = await quoteService.findUnique(id)
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(quote)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const validStatuses = ["DRAFT","SENT","ACCEPTED","REJECTED","EXPIRED"]
    if (body.status && !validStatuses.includes(String(body.status)))
      return NextResponse.json({ error: "Invalid status" }, { status: 422 })

    const rawValue = body.quoteValue !== undefined ? parseFloat(String(body.quoteValue)) : undefined
    if (rawValue !== undefined && !isNaN(rawValue) && rawValue < 0) {
      return NextResponse.json({ error: "Quote value can't be negative" }, { status: 422 })
    }
    let vatRate: number | null | undefined = undefined
    if (body.vatRate !== undefined) {
      if (body.vatRate === null || body.vatRate === "") {
        vatRate = null
      } else {
        const parsed = parseFloat(String(body.vatRate))
        if (isNaN(parsed) || parsed < 0 || parsed > 100) {
          return NextResponse.json({ error: "VAT rate must be a number between 0 and 100" }, { status: 422 })
        }
        vatRate = parsed
      }
    }
    const data: import("@/lib/db").UpdateQuoteData = {}
    if (body.clientId      !== undefined) data.clientId      = body.clientId ? String(body.clientId) : null
    if (body.clientCompany !== undefined) data.clientCompany = String(body.clientCompany).trim()
    if (body.contactName   !== undefined) data.contactName   = body.contactName ? String(body.contactName).trim() : null
    if (body.address       !== undefined) data.address       = String(body.address).trim()
    if (body.description   !== undefined) data.description   = String(body.description).trim()
    if (rawValue           !== undefined && !isNaN(rawValue)) data.quoteValue = Math.round(rawValue * 100) / 100
    if (body.quoteDate     !== undefined) data.quoteDate     = String(body.quoteDate)
    if (body.expiryDate    !== undefined) data.expiryDate    = body.expiryDate ? String(body.expiryDate) : null
    if (body.status        !== undefined) data.status        = String(body.status)
    if (body.notes         !== undefined) data.notes         = body.notes ? String(body.notes).trim() : null
    if (vatRate            !== undefined) data.vatRate       = vatRate

    // If line items are part of this update, they — not whatever
    // quoteValue the client sent — are the enforced source of truth for the
    // total. Same reasoning as the create route: the frontend keeps these
    // in sync as a convenience, but the API itself must not trust a
    // client-claimed total when it can simply compute the real one.
    const submittedLineItems = body.lineItems !== undefined ? parseLineItems(body.lineItems) : null
    if (submittedLineItems && submittedLineItems.length) {
      data.quoteValue = Math.round(submittedLineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100
    }
    // jobId is intentionally not settable here — only /api/quotes/[id]/convert may link a
    // quote to a job, since that route enforces the ACCEPTED-and-not-already-converted rules.

    const updated = await quoteService.update(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (submittedLineItems !== null) {
      await quoteService.replaceLineItems(id, submittedLineItems)
    }

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

  const { id } = await params
  const quote = await quoteService.findUnique(id)
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (quote.jobId) {
    return NextResponse.json(
      { error: "This quote has been converted to a job and can't be deleted." },
      { status: 409 },
    )
  }
  const ok = await quoteService.delete(id)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
