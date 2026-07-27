import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { requireSignIn, requireRole, actorName } from "@/shared/auth/auth"
import { isWorkItemsModelEnabled } from "@/lib/supabase/feature-flags"
import { allocateDrawingNumberAsync } from "@/shared/supabase/sequence-service"
import { ensureSequencesSeeded } from "@/lib/supabase/seed-sequences"
import { createId } from "@paralleldrive/cuid2"
import { isValidWorksType, OTHER_WORKS_TYPE, sanitizeJobTags } from "@/lib/constants"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { clientService } from "@/lib/services/client-service"
import { holdService } from "@/modules/clients/hold/services/hold-service"
import { apiInternalError } from "@/shared/api-errors"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { parentJobService } from "@/modules/jobs/services/parent-work-item-service"
import { resolveDirectoryDesigner } from "../services/designer-directory"

function modelDisabled() {
  return NextResponse.json(
    { error: "Work items model is not enabled. Set WORK_ITEMS_MODEL=true." },
    { status: 503 },
  )
}

/** GET — search parent jobs (always findable, including idle projects). */
export async function GET(req: NextRequest) {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth
  if (!isWorkItemsModelEnabled()) return modelDisabled()

  try {
    const sp = req.nextUrl.searchParams
    const page = parsePageParam(sp.get("page"))
    const limit = parseLimitParam(sp.get("limit"), 25, 100)
    const search = sp.get("search") ?? undefined
    const clientId = sp.get("clientId") ?? undefined

    const { rows, total } = await parentJobService.search({
      search,
      clientId,
      skip: (page - 1) * limit,
      take: limit,
    })

    return listResponse({
      parents: rows,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (err) {
    return apiInternalError("parent-jobs.list", err)
  }
}

/** POST — create Parent Job + Original Issue work item. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN", "ENGINEER"])
  if (auth instanceof NextResponse) return auth
  if (!isWorkItemsModelEnabled()) return modelDisabled()

  try {
    await ensureSequencesSeeded()
    const body = await req.json()

    const siteName = typeof body.siteName === "string" ? body.siteName.trim() : ""
    const siteAddress = typeof body.siteAddress === "string" ? body.siteAddress.trim() : ""
    const address = typeof body.address === "string" && body.address.trim()
      ? body.address.trim()
      : composeJobAddress(siteName || null, siteAddress || null)

    if (!address) {
      return NextResponse.json({ error: "Site / address is required" }, { status: 400 })
    }

    const typeOfWorks = typeof body.typeOfWorks === "string" ? body.typeOfWorks.trim() : ""
    const customTypeDescription: string | null =
      typeof body.customTypeDescription === "string" ? body.customTypeDescription.trim() || null : null
    if (!typeOfWorks || !isValidWorksType(typeOfWorks)) {
      return NextResponse.json({ error: "Type of works is required" }, { status: 400 })
    }
    if (typeOfWorks === OTHER_WORKS_TYPE && !customTypeDescription) {
      return NextResponse.json({ error: "Describe Other type of works" }, { status: 400 })
    }

    const clientCompany = typeof body.clientCompany === "string" ? body.clientCompany.trim() : ""
    const requestedBy = typeof body.requestedBy === "string" ? body.requestedBy.trim() : ""
    if (!clientCompany || !requestedBy) {
      return NextResponse.json({ error: "Client and requested by are required" }, { status: 400 })
    }

    let clientId: string | null = typeof body.clientId === "string" ? body.clientId : null
    if (clientId) {
      const client = await clientService.findUnique(clientId)
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 400 })
    } else if (clientCompany) {
      const matched = await clientService.findByName(clientCompany)
      clientId = matched?.id ?? null
    }

    if (clientId && body.proceedDespiteHold !== true) {
      const hold = await holdService.activeHoldForClient(clientId)
      if (hold) {
        return NextResponse.json({
          error: "Client is on hold",
          onHold: true,
          holdReason: hold.reason,
        }, { status: 422 })
      }
    }

    const money: {
      quoteValue?: number | null
      variationFees?: number | null
      additionalCharges?: number | null
    } = {}
    for (const key of ["quoteValue", "variationFees", "additionalCharges"] as const) {
      const err = applyOptionalMoneyField(body, key, money)
      if (err) return err
    }

    let tags: string[] = []
    if (body.tags !== undefined) {
      const sanitized = sanitizeJobTags(body.tags)
      if (sanitized === null) {
        return NextResponse.json({ error: "One or more tags are not in the approved list", field: "tags" }, { status: 422 })
      }
      tags = sanitized
    }

    const drawingNumber = await allocateDrawingNumberAsync()
    const id = createId()
    const designerResolved = await resolveDirectoryDesigner(
      typeof body.designer === "string" ? body.designer : "",
    )
    if (!designerResolved.ok) {
      return NextResponse.json({ error: designerResolved.error, field: "designer" }, { status: 422 })
    }
    const dashboard = await parentJobService.createWithOriginal({
      id,
      drawingNumber,
      address,
      siteName: siteName || null,
      siteAddress: siteAddress || null,
      typeOfWorks,
      customTypeDescription,
      clientCompany,
      clientId,
      requestedBy,
      designer: designerResolved.designer,
      notes: typeof body.notes === "string" ? body.notes : null,
      tags,
      quoteValue: money.quoteValue ?? null,
      quoteReference: typeof body.quoteReference === "string" ? body.quoteReference : null,
      quoteDate: typeof body.quoteDate === "string" ? body.quoteDate : null,
      commercialNotes: typeof body.commercialNotes === "string" ? body.commercialNotes : null,
      variationFees: money.variationFees ?? null,
      additionalCharges: money.additionalCharges ?? null,
      requestedDate: typeof body.requestedDate === "string" ? body.requestedDate : null,
      requiredByDate: resolveRequiredByDate(body.requiredByDate) ?? null,
      changedBy: actorName(auth.user),
    })

    return NextResponse.json(dashboard, { status: 201 })
  } catch (err) {
    return apiInternalError("parent-jobs.create", err)
  }
}
