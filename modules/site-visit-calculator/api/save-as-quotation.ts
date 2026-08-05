import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { quoteService, buildQuotePdfFromPayload } from "@/modules/quotes"
import { clientService } from "@/modules/clients"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { ensureSequencesSeeded } from "@/shared/supabase/seed-sequences"
import type { SiteVisitCalculationResult } from "../types"
import {
  buildSiteVisitCalculatorMeta,
  buildSiteVisitQuoteLineItems,
  mapSiteVisitEstimateToQuotationData,
  serializeSiteVisitMetaNotes,
  validateSiteVisitResultForExport,
} from "../services/map-site-visit-estimate-to-quotation"

const bodySchema = z.object({
  result: z.record(z.string(), z.unknown()),
  clientId: z.union([z.string(), z.null()]).optional(),
  clientCompany: z.string().min(1),
  contactName: z.union([z.string(), z.null()]).optional(),
  purchaseOrder: z.union([z.string(), z.null()]).optional(),
  preparedBy: z.union([z.string(), z.null()]).optional(),
  quotationLabel: z.union([z.string(), z.null()]).optional(),
  descriptionOverride: z.union([z.string(), z.null()]).optional(),
  generatePdf: z.boolean().optional(),
}).passthrough()

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Persist a site-visit estimate as a formal quotation in the Quotes module.
 * Assigns the next real quotation number. Optionally returns a PDF.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("site-visit-calculator")
    if (auth instanceof NextResponse) return auth

    await ensureSequencesSeeded()

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path?.[0]
      if (field === "clientCompany") {
        return NextResponse.json({ error: "Client is required to save as a quotation" }, { status: 422 })
      }
      return NextResponse.json({ error: "Invalid request body" }, { status: 422 })
    }

    const body = parsed.data
    const result = body.result as unknown as SiteVisitCalculationResult
    const invalid = validateSiteVisitResultForExport(result)
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 422 })
    }

    const clientCompany = body.clientCompany.trim()
    if (!clientCompany) {
      return NextResponse.json({ error: "Client is required to save as a quotation" }, { status: 422 })
    }

    let clientId: string | null = body.clientId ? String(body.clientId).trim() : null
    let customerId: string | null = null
    let contactName = body.contactName?.trim() || null

    if (clientId) {
      const client = await clientService.findUnique(clientId)
      if (client) {
        customerId = client.accountCode ?? null
        if (!contactName && client.contactName) contactName = client.contactName
      }
    } else {
      const found = await clientService.findByName(clientCompany)
      if (found) {
        clientId = found.id
        customerId = found.accountCode ?? null
        if (!contactName && found.contactName) contactName = found.contactName
      }
    }

    const purchaseOrder = body.purchaseOrder?.trim() || null
    const quotationLabel = body.quotationLabel?.trim() || null
    const descriptionOverride = body.descriptionOverride?.trim() || null
    const preparedBy = body.preparedBy?.trim() || actorName(auth.user)

    const lineItems = buildSiteVisitQuoteLineItems(result, {
      descriptionOverride,
      purchaseOrder,
    })

    const meta = buildSiteVisitCalculatorMeta(result, { purchaseOrder, quotationLabel })
    const notesParts: string[] = []
    if (quotationLabel) notesParts.push(`Reference: ${quotationLabel}`)
    if (descriptionOverride) notesParts.push(descriptionOverride)
    const notes = serializeSiteVisitMetaNotes(meta, notesParts.join("\n") || null)

    const quoteDate = todayIso()
    const vatRatePercent = Math.round(result.rates.vatRate * 10000) / 100

    let quote = await quoteService.create({
      clientId,
      clientCompany,
      contactName,
      address: result.siteAddress,
      description: "Site Visit",
      typeOfWorks: OTHER_WORKS_TYPE,
      customTypeDescription: "Site Visit",
      quoteValue: result.subtotal,
      quoteDate,
      expiryDate: addDaysIso(quoteDate, 30),
      status: "DRAFT",
      notes,
      createdBy: preparedBy,
      vatRate: vatRatePercent,
    })

    await quoteService.replaceLineItems(
      quote.id,
      lineItems.map(li => ({
        description: li.description,
        amount: li.amount,
        vatApplicable: li.vatApplicable,
      })),
    )

    quote = (await quoteService.findUnique(quote.id)) ?? quote

    if (body.generatePdf) {
      const data = mapSiteVisitEstimateToQuotationData(result, {
        draft: false,
        quotationNumber: quote.quoteNumber,
        clientCompany,
        contactName,
        clientId,
        customerId,
        purchaseOrder,
        preparedBy,
        quotationLabel,
        descriptionOverride,
        issueDate: quote.quoteDate,
        validUntil: quote.expiryDate,
      })
      // Formal filename uses quotation number convention (Q-YYYY-NNN.pdf)
      data.filename = `${quote.quoteNumber.replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf`

      const { pdfBytes, filename } = await buildQuotePdfFromPayload(data)
      return new NextResponse(Buffer.from(pdfBytes), {
        status: 201,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Quote-Id": quote.id,
          "X-Quote-Number": quote.quoteNumber,
        },
      })
    }

    return NextResponse.json({ quote }, { status: 201 })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.save-as-quotation", err)
  }
}
