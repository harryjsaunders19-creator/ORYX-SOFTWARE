import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { listResponse } from "@/shared/utils/api-cache"
import { quoteService } from "../services/quote-service"
import { clientService } from "@/lib/services/client-service"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { parseQuoteWorksBody, shouldAutoExpireQuote } from "../quote-works"
import { ensureSequencesSeeded } from "@/lib/supabase/seed-sequences"
import { apiInternalError } from "@/shared/api-errors"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"

interface LineItemInput { description?: unknown; amount?: unknown; vatApplicable?: unknown }

const createQuoteBodySchema = z.object({
  clientId: z.union([z.string(), z.null()]).optional(),
  clientCompany: z.string().optional(),
  contactName: z.union([z.string(), z.null()]).optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  typeOfWorks: z.string().optional(),
  customTypeDescription: z.union([z.string(), z.null()]).optional(),
  quoteValue: z.union([z.string(), z.number(), z.null()]).optional(),
  quoteDate: z.union([z.string(), z.null()]).optional(),
  expiryDate: z.union([z.string(), z.null()]).optional(),
  status: z.string().optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  vatRate: z.union([z.string(), z.number(), z.null()]).optional(),
  lineItems: z.array(z.object({
    description: z.string().optional(),
    amount: z.union([z.string(), z.number(), z.null()]).optional(),
    vatApplicable: z.boolean().optional(),
  }).passthrough()).optional(),
}).passthrough()

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
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp     = req.nextUrl.searchParams
    const search = sp.get("search") ?? ""
    const status = sp.get("status") ?? ""
    const page   = parsePageParam(sp.get("page"))
    const limit  = parseLimitParam(sp.get("limit"), 25, 100)
    const opts   = { ...(search && { search }), ...(status && { status }) }
    const [quotes, total, expiringSoonCount, expiredClearableCount] = await Promise.all([
      quoteService.findMany({ ...opts, skip: (page - 1) * limit, take: limit }),
      quoteService.count(opts),
      quoteService.countExpiringSoon(),
      Promise.resolve(quoteService.countExpiredDeletable()),
    ])
    return listResponse({ quotes, total, page, limit, expiringSoonCount, expiredClearableCount })
  } catch (err) {
    return apiInternalError("quotes.list.get", err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    await ensureSequencesSeeded()

    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const parsedBody = createQuoteBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as Record<string, unknown>

    if (!body.clientCompany || String(body.clientCompany).trim() === "")
      return NextResponse.json({ error: "Client company is required" }, { status: 422 })
    if (!body.address || String(body.address).trim() === "")
      return NextResponse.json({ error: "Address is required" }, { status: 422 })

    const works = parseQuoteWorksBody(body)
    if ("error" in works) {
      return NextResponse.json({ error: works.error, field: works.field }, { status: 422 })
    }

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
      const found = await clientService.findByName(clientCompany)
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

    const expiryDate = body.expiryDate ? String(body.expiryDate).slice(0, 10) : null
    let status = body.status ? String(body.status) : "DRAFT"
    if (shouldAutoExpireQuote(status, expiryDate)) status = "EXPIRED"

    const quote = await quoteService.create({
      clientId,
      clientCompany,
      contactName:  body.contactName ? String(body.contactName).trim() : null,
      address:      String(body.address).trim(),
      description:  works.description,
      typeOfWorks:  works.typeOfWorks,
      customTypeDescription: works.customTypeDescription,
      quoteValue:   effectiveQuoteValue,
      quoteDate:    String(body.quoteDate).slice(0, 10),
      expiryDate,
      status,
      notes:        body.notes ? String(body.notes).trim() : null,
      createdBy:    actorName(auth.user),
      vatRate,
    })

    if (lineItems.length) await quoteService.replaceLineItems(quote.id, lineItems)

    return NextResponse.json(quote, { status: 201 })
  } catch (err) {
    return apiInternalError("quotes.list.create", err)
  }
}
