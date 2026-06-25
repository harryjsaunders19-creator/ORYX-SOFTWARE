import { NextRequest, NextResponse } from "next/server"
import { jobDb, sequenceDb, clientDb } from "@/lib/db"
import { formatDrawingNumber, getYearMonthKey } from "@/lib/drawing-number"
import { createId } from "@paralleldrive/cuid2"
import { VALID_ITEM_TYPES, isValidWorksType, OTHER_WORKS_TYPE } from "@/lib/constants"
import { getCurrentUser } from "@/lib/auth"

// Reference-number prefixes for non-drawing item types
const REF_PREFIXES: Record<string, string> = {
  SITE_VISIT:  "SV",
  SURVEY:      "SRV",
  INSPECTION:  "INS",
}

export async function GET(req: NextRequest) {
  try {
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
    const sortBy         = sp.get("sortBy")        ?? "dateCreated"
    const sortDir        = (sp.get("sortDir")      === "asc" ? "asc" : "desc") as "asc" | "desc"

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
      const jobs = jobDb.findMany({ where, orderBy: { field: sortBy, dir: sortDir } })
      return NextResponse.json({ jobs, total: jobs.length })
    }

    const [jobs, total] = [
      jobDb.findMany({ where, orderBy: { field: sortBy, dir: sortDir }, skip: (page - 1) * limit, take: limit }),
      jobDb.count(where),
    ]
    return NextResponse.json({ jobs, total, page, limit })
  } catch (err) {
    console.error("[GET /api/jobs]", err)
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }

    // Determine item type (defaults to DESIGN for backwards compatibility)
    const itemType = typeof body.itemType === "string" && VALID_ITEM_TYPES.includes(body.itemType as never)
      ? body.itemType as string
      : "DESIGN"

    // Required fields (all item types)
    for (const [field, message] of [
      ["address",       "Site address is required"],
      ["clientCompany", "Client company is required"],
      ["requestedBy",   "Requested by is required"],
    ] as [string, string][]) {
      if (!body[field] || String(body[field]).trim() === "") {
        return NextResponse.json({ error: message, field }, { status: 422 })
      }
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

    // Generate reference number based on item type
    let drawingNumber: string
    if (itemType === "DESIGN") {
      const { year, month, key } = getYearMonthKey()
      const seq = sequenceDb.nextSequence(key)
      drawingNumber = formatDrawingNumber(year, month, seq)
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
      const client = clientDb.findUnique(String(body.clientId).trim())
      if (client) {
        resolvedClientId      = client.id
        resolvedClientCompany = client.name   // keep in sync
      }
    } else if (resolvedClientCompany) {
      // Try to find existing client by name (migration path)
      const client = clientDb.findByName(resolvedClientCompany)
      if (client) resolvedClientId = client.id
    }

    const job = jobDb.create({
      id,
      drawingNumber,
      itemType,
      address:         String(body.address).trim(),
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
      requestedDate:   body.requestedDate   ? String(body.requestedDate)            : null,
      requiredByDate:  body.requiredByDate  ? String(body.requiredByDate)           : null,
      parentJobId:     null,
      revisionLetter:  null,
      changedBy,
    })

    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    console.error("[POST /api/jobs]", err)
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
  }
}
