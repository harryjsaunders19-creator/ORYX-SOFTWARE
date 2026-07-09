import { NextRequest, NextResponse } from "next/server"
import { listResponse } from "@/shared/utils/api-cache"
import { jobService } from "../services/job-service"
import { clientService } from "@/lib/services/client-service"
import { allocateDrawingNumber, sequenceDb } from "@/lib/db"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { createId } from "@paralleldrive/cuid2"
import { VALID_ITEM_TYPES, isValidWorksType, OTHER_WORKS_TYPE, REF_PREFIX_BY_ITEM_TYPE } from "@/lib/constants"
import { requireSignIn } from "@/shared/auth/auth"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import {
  buildLatestRevisionMap,
  canAddRevisionFrom,
} from "@/lib/revision-chain"
import { ensureSequencesSeeded } from "@/lib/supabase/seed-sequences"

/**
 * Compute canAddRevision without an extra DB round trip.
 * `allJobs` is the full unsliced list (available when fetching all for sort);
 * falls back to the page slice which is safe when revisions are rare.
 */
function flagRevisions<T extends { id: string; parentJobId: string | null }>(
  pageJobs: T[],
  allJobs?: T[],
): (T & { canAddRevision: boolean })[] {
  const source = allJobs ?? pageJobs
  const latestMap = buildLatestRevisionMap(source.filter(j => j.parentJobId !== null))
  return pageJobs.map(job => ({ ...job, canAddRevision: canAddRevisionFrom(job, latestMap) }))
}

// Reference-number prefixes for non-drawing item types — sourced from WORK_ITEM_TYPES
const REF_PREFIXES = REF_PREFIX_BY_ITEM_TYPE

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const sp             = req.nextUrl.searchParams
    const search         = sp.get("search")        ?? ""
    const status         = sp.get("status")        ?? ""
    const itemType       = sp.get("itemType")      ?? ""
    const typeOfWorks    = sp.get("typeOfWorks")   ?? ""
    const unassigned     = sp.get("unassigned")    === "true"
    const onlyOriginals  = sp.get("onlyOriginals") === "true"
    const onlyRevisions  = sp.get("onlyRevisions") === "true"
    const overdue        = sp.get("overdue")        === "true"
    const dueToday       = sp.get("dueToday")       === "true"
    const dueThisWeek    = sp.get("dueThisWeek")    === "true"
    const page           = Math.max(1, parseInt(sp.get("page")    ?? "1"))
    const limit          = Math.max(1, Math.min(100, parseInt(sp.get("limit") ?? "25")))
    const exportAll      = sp.get("export")        === "true"
    const sortBy         = sp.get("sortBy")        ?? "drawingNumber"
    const sortDir        = (sp.get("sortDir")      === "desc" ? "desc" : "asc") as "asc" | "desc"

    const clientId = sp.get("clientId") ?? ""
    const where = {
      ...(search        && { search }),
      ...(status        && { status }),
      ...(itemType      && { itemType }),
      ...(typeOfWorks   && { typeOfWorks }),
      ...(clientId      && { clientId }),
      ...(unassigned    && { unassigned: true }),
      ...(onlyOriginals && { onlyOriginals: true }),
      ...(onlyRevisions && { onlyRevisions: true }),
      ...(overdue        && { overdue: true }),
      ...(dueToday       && { dueToday: true }),
      ...(dueThisWeek    && { dueThisWeek: true }),
    }

    if (exportAll) {
      const { jobs: rawJobs, allForRevisions } = await jobService.findManyWithCount({
        where,
        orderBy: { field: sortBy, dir: sortDir },
      })
      const jobs = flagRevisions(rawJobs, allForRevisions)
      return listResponse({ jobs, total: jobs.length })
    }

    const { jobs: rawJobs, total, allForRevisions } = await jobService.findManyWithCount({
      where,
      orderBy: { field: sortBy, dir: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    })
    const jobs = flagRevisions(rawJobs, allForRevisions)
    return listResponse({ jobs, total, page, limit })
  } catch (err) {
    console.error("[GET /api/jobs]", err)
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    // Determine item type (defaults to DESIGN for backwards compatibility)
    const itemType = typeof body.itemType === "string" && VALID_ITEM_TYPES.includes(body.itemType as never)
      ? body.itemType as string
      : "DESIGN"

    // Required fields (all item types)
    const siteName = typeof body.siteName === "string" ? body.siteName.trim() : ""
    const siteAddress = typeof body.siteAddress === "string" ? body.siteAddress.trim() : ""
    const address = typeof body.address === "string" && body.address.trim()
      ? String(body.address).trim()
      : composeJobAddress(siteName, siteAddress)

    for (const [field, message] of [
      ["clientCompany", "Client company is required"],
      ["requestedBy",   "Requested by is required"],
    ] as [string, string][]) {
      if (!body[field] || String(body[field]).trim() === "") {
        return NextResponse.json({ error: message, field }, { status: 422 })
      }
    }
    if (!address) {
      return NextResponse.json({ error: "Site name or address is required", field: "siteAddress" }, { status: 422 })
    }

    // typeOfWorks only required for Design — and once provided, must be one
    // of the approved values. This is the real enforcement boundary: the
    // job form's combobox only ever offers the approved list, but nothing
    // stops a direct API call from sending arbitrary text, so the
    // "no new arbitrary values" requirement has to be checked here too.
    if (itemType === "DESIGN") {
      if (!body.typeOfWorks || String(body.typeOfWorks).trim() === "") {
        return NextResponse.json({ error: "Type of works is required for Design items", field: "typeOfWorks" }, { status: 422 })
      }
      if (!isValidWorksType(String(body.typeOfWorks).trim())) {
        return NextResponse.json({ error: "Type of works must be one of the approved values", field: "typeOfWorks" }, { status: 422 })
      }
      if (String(body.typeOfWorks).trim() === OTHER_WORKS_TYPE && (!body.customTypeDescription || String(body.customTypeDescription).trim() === "")) {
        return NextResponse.json({ error: "Please specify the type of works", field: "customTypeDescription" }, { status: 422 })
      }
    }

    const id        = createId()
    const changedBy = typeof body.changedBy === "string" && body.changedBy.trim()
      ? body.changedBy.trim() : "System"
    const designer  = typeof body.designer === "string" ? body.designer.trim() : ""

    const rawQuote = body.quoteValue !== undefined && body.quoteValue !== null && body.quoteValue !== ""
      ? parseFloat(String(body.quoteValue)) : null
    if (rawQuote !== null && !isNaN(rawQuote) && rawQuote < 0) {
      return NextResponse.json({ error: "Quote value can't be negative" }, { status: 422 })
    }
    const quoteValue = rawQuote !== null && !isNaN(rawQuote) ? Math.round(rawQuote * 100) / 100 : null

    const commercial: Record<string, unknown> = {}
    for (const field of ["variationFees", "additionalCharges"] as const) {
      const err = applyOptionalMoneyField(body, field, commercial)
      if (err) return err
    }

    // Seed sequence counters from Supabase once per container so we never
    // generate a drawing number that already exists in Supabase.
    await ensureSequencesSeeded()

    // Generate reference number based on item type
    let drawingNumber: string
    if (itemType === "DESIGN") {
      drawingNumber = allocateDrawingNumber()
    } else if (itemType === "REVISION") {
      // Revisions are created via POST /api/jobs/[id]/revisions — not here
      return NextResponse.json({ error: "Create revisions via POST /api/jobs/[parentId]/revisions" }, { status: 422 })
    } else {
      // Site Visit, Survey, Inspection
      const prefix = REF_PREFIXES[itemType]
      drawingNumber = sequenceDb.nextRefNumber(prefix)
    }

    // Resolve clientId and clientCompany together
    let resolvedClientId: string | null = null
    let resolvedClientCompany = String(body.clientCompany ?? "").trim()

    if (body.clientId && String(body.clientId).trim()) {
      const client = await clientService.findUnique(String(body.clientId).trim())
      if (client) {
        resolvedClientId      = client.id
        resolvedClientCompany = client.name   // keep in sync
      }
    } else if (resolvedClientCompany) {
      const client = await clientService.findByName(resolvedClientCompany)
      if (client) resolvedClientId = client.id
    }

    const job = await jobService.create({
      id,
      drawingNumber,
      itemType,
      address,
      siteName: siteName || null,
      siteAddress: siteAddress || null,
      typeOfWorks:     body.typeOfWorks ? String(body.typeOfWorks).trim() : "",
      customTypeDescription: (body.typeOfWorks === OTHER_WORKS_TYPE && body.customTypeDescription)
        ? String(body.customTypeDescription).trim() : null,
      clientCompany:   resolvedClientCompany,
      clientId:        resolvedClientId,
      requestedBy:     String(body.requestedBy).trim(),
      status:          "NEW_REQUEST",
      designer,
      dateCompleted:   body.dateCompleted ? String(body.dateCompleted) : null,
      notes:           body.notes ? String(body.notes).trim() : null,
      quoteValue,
      quoteReference:  body.quoteReference  ? String(body.quoteReference).trim()  : null,
      quoteDate:       body.quoteDate       ? String(body.quoteDate)                : null,
      commercialNotes: body.commercialNotes ? String(body.commercialNotes).trim()  : null,
      variationFees: commercial.variationFees as number | null | undefined,
      additionalCharges: commercial.additionalCharges as number | null | undefined,
      requestedDate:   body.requestedDate   ? String(body.requestedDate)            : null,
      requiredByDate:  resolveRequiredByDate(body.requiredByDate ? String(body.requiredByDate) : null),
      parentJobId:     null,
      revisionLetter:  null,
      changedBy,
    })

    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    const detail = err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err)
    console.error("[POST /api/jobs]", detail, err)
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
  }
}
