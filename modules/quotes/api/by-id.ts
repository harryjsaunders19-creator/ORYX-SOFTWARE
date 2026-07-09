import { NextRequest, NextResponse } from "next/server"
import { quoteService } from "../services/quote-service"
import { requireSignIn, requireRole } from "@/shared/auth/auth"
import { parseQuoteWorksBody, shouldAutoExpireQuote } from "../quote-works"
import { resourceResponse } from "@/shared/utils/api-cache"
import { errorMessage } from "@/shared/utils/error-message"
import type { UpdateQuoteData } from "../types/quote-types"

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
  const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

  const { id } = await params
  // Run expiry in the background — don't block the single-quote read.
  quoteService.expirePastDue().catch(err =>
    console.error("[quotes/id] background expirePastDue failed:", err),
  )
  const quote  = await quoteService.findUnique(id)
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return resourceResponse(quote)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const existing = await quoteService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (body.status === "ACCEPTED") {
      if (
        existing.status === "EXPIRED"
        || shouldAutoExpireQuote(existing.status, existing.expiryDate)
      ) {
        if (existing.status !== "EXPIRED") {
          await quoteService.update(id, { status: "EXPIRED" })
        }
        return NextResponse.json(
          { error: "This quote has passed its expiry date and cannot be accepted." },
          { status: 422 },
        )
      }
    }

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
    const data: UpdateQuoteData = {}
    if (body.clientId      !== undefined) data.clientId      = body.clientId ? String(body.clientId) : null
    if (body.clientCompany !== undefined) data.clientCompany = String(body.clientCompany).trim()
    if (body.contactName   !== undefined) data.contactName   = body.contactName ? String(body.contactName).trim() : null
    if (body.address       !== undefined) data.address       = String(body.address).trim()
    if (body.typeOfWorks !== undefined || body.customTypeDescription !== undefined) {
      const works = parseQuoteWorksBody({
        typeOfWorks: body.typeOfWorks ?? existing.typeOfWorks ?? "",
        customTypeDescription: body.customTypeDescription ?? existing.customTypeDescription ?? "",
      })
      if ("error" in works) {
        return NextResponse.json({ error: works.error, field: works.field }, { status: 422 })
      }
      data.typeOfWorks = works.typeOfWorks
      data.customTypeDescription = works.customTypeDescription
      data.description = works.description
    } else if (body.description !== undefined) {
      data.description = String(body.description).trim()
    }
    if (rawValue           !== undefined && !isNaN(rawValue)) data.quoteValue = Math.round(rawValue * 100) / 100
    if (body.quoteDate     !== undefined) data.quoteDate     = String(body.quoteDate).slice(0, 10)
    if (body.expiryDate    !== undefined) data.expiryDate    = body.expiryDate ? String(body.expiryDate).slice(0, 10) : null
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

    const nextStatus = data.status ?? existing.status
    const nextExpiry = data.expiryDate !== undefined ? data.expiryDate : existing.expiryDate
    if (shouldAutoExpireQuote(nextStatus, nextExpiry)) {
      data.status = "EXPIRED"
    }

    const updated = await quoteService.update(id, data)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (submittedLineItems !== null) {
      await quoteService.replaceLineItems(id, submittedLineItems)
    }

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const archived = await quoteService.archive(id, auth.user.id, auth.user.name)
    if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true, archived: true, quote: archived })
  } catch (err) {
    console.error("[DELETE /api/quotes/[id]]", err)
    return NextResponse.json({ error: "Failed to archive quote", detail: errorMessage(err) }, { status: 500 })
  }
}
