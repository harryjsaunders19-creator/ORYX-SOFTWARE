import { NextRequest, NextResponse } from "next/server"
import { quoteDb, clientDb, quoteLineItemDb } from "@/lib/db"
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

export async function GET(req: NextRequest) {
  try {
    const sp     = req.nextUrl.searchParams
    const search = sp.get("search") ?? ""
    const status = sp.get("status") ?? ""
    const page   = Math.max(1, parseInt(sp.get("page") ?? "1"))
    const limit  = Math.max(1, Math.min(100, parseInt(sp.get("limit") ?? "25")))
    const opts   = { ...(search && { search }), ...(status && { status }) }
    const [quotes, total] = [
      quoteDb.findMany({ ...opts, skip: (page - 1) * limit, take: limit }),
      quoteDb.count(opts),
    ]
    return NextResponse.json({ quotes, total, page, limit })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    if (!body.clientCompany || String(body.clientCompany).trim() === "")
      return NextResponse.json({ error: "Client company is required" }, { status: 422 })
    if (!body.address || String(body.address).trim() === "")
      return NextResponse.json({ error: "Address is required" }, { status: 422 })
    if (!body.description || String(body.description).trim() === "")
      return NextResponse.json({ error: "Description is required" }, { status: 422 })
    if (!body.quoteDate)
      return NextResponse.json({ error: "Quote date is required" }, { status: 422 })

    const rawValue = parseFloat(String(body.quoteValue ?? "0"))
    if (!isNaN(rawValue) && rawValue < 0) {
      return NextResponse.json({ error: "Quote value can't be negative" }, { status: 422 })
    }
    const quoteValue = isNaN(rawValue) ? 0 : Math.round(rawValue * 100) / 100

    let vatRate: number | null = null
    if (body.vatRate !== undefined && body.vatRate !== null && body.vatRate !== "") {
      const parsed = parseFloat(String(body.vatRate))
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        return NextResponse.json({ error: "VAT rate must be a number between 0 and 100" }, { status: 422 })
      }
      vatRate = parsed
    }

    // Resolve clientId from clientCompany if not provided
    let clientId: string | null = body.clientId ? String(body.clientId).trim() : null
    const clientCompany = String(body.clientCompany).trim()
    if (!clientId) {
      const found = clientDb.findByName(clientCompany)
      if (found) clientId = found.id
    }

    // Line items, if any, are the source of truth for quoteValue — computed
    // here server-side rather than trusted from the request body. The
    // frontend form already keeps these in sync as a UX convenience, but
    // that's not a security or correctness boundary: anyone calling this
    // API directly must get the same enforced invariant, not a number the
    // client happened to send.
    const lineItems = parseLineItems(body.lineItems)
    const effectiveQuoteValue = lineItems.length
      ? Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100
      : quoteValue

    const quote = quoteDb.create({
      clientId,
      clientCompany,
      contactName:  body.contactName ? String(body.contactName).trim() : null,
      address:      String(body.address).trim(),
      description:  String(body.description).trim(),
      quoteValue:   effectiveQuoteValue,
      quoteDate:    String(body.quoteDate),
      expiryDate:   body.expiryDate ? String(body.expiryDate) : null,
      status:       body.status ? String(body.status) : "DRAFT",
      notes:        body.notes ? String(body.notes).trim() : null,
      createdBy:    body.createdBy ? String(body.createdBy) : "System",
      vatRate,
    })

    if (lineItems.length) quoteLineItemDb.replaceForQuote(quote.id, lineItems)

    return NextResponse.json(quote, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
