import { NextRequest, NextResponse } from "next/server"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { apiInternalError } from "@/shared/api-errors"
import { buildQuotePdfFromPayload } from "@/modules/quotes"
import { clientService } from "@/modules/clients"
import type { SiteVisitCalculationResult } from "../types"
import {
  mapSiteVisitEstimateToQuotationData,
  validateSiteVisitResultForExport,
} from "../services/map-site-visit-estimate-to-quotation"

interface ExportBody {
  result?: SiteVisitCalculationResult
  clientId?: string | null
  clientCompany?: string | null
  contactName?: string | null
  purchaseOrder?: string | null
  preparedBy?: string | null
  quotationLabel?: string | null
  descriptionOverride?: string | null
}

/**
 * Draft quotation PDF preview for a site-visit estimate.
 * Uses the shared ORYX quotation template. Quotation number is "DRAFT"
 * — does not create a quote record or consume a quotation number.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("site-visit-calculator")
    if (auth instanceof NextResponse) return auth

    const { checkRateLimit, rateLimitedResponse, RATE_PRESETS } = await import("@/shared/auth/rate-limit")
    if (!(await checkRateLimit(`pdf:${auth.user.id}`, RATE_PRESETS.pdf))) {
      return rateLimitedResponse()
    }

    let body: ExportBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const result = body.result
    const invalid = validateSiteVisitResultForExport(result)
    if (invalid || !result) {
      return NextResponse.json({ error: invalid ?? "Calculation result is required" }, { status: 422 })
    }

    let customerId: string | null = null
    let clientCompany = typeof body.clientCompany === "string" ? body.clientCompany.trim() : ""
    let contactName = typeof body.contactName === "string" ? body.contactName.trim() : ""

    if (body.clientId) {
      const client = await clientService.findUnique(String(body.clientId))
      if (client) {
        customerId = client.accountCode ?? null
        if (!clientCompany) clientCompany = client.name
        if (!contactName && client.contactName) contactName = client.contactName
      }
    }

    const preparedBy = (typeof body.preparedBy === "string" && body.preparedBy.trim())
      || actorName(auth.user)

    const data = mapSiteVisitEstimateToQuotationData(result, {
      draft: true,
      clientCompany,
      contactName: contactName || null,
      clientId: body.clientId ? String(body.clientId) : null,
      customerId,
      purchaseOrder: typeof body.purchaseOrder === "string" ? body.purchaseOrder : null,
      preparedBy,
      quotationLabel: typeof body.quotationLabel === "string" ? body.quotationLabel : null,
      descriptionOverride: typeof body.descriptionOverride === "string" ? body.descriptionOverride : null,
    })

    const { pdfBytes, filename } = await buildQuotePdfFromPayload(data)

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (err) {
    return apiInternalError("site-visit-calculator.api.pdf", err)
  }
}
