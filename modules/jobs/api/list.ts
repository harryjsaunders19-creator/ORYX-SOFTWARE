import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { listResponse } from "@/shared/utils/api-cache"
import { jobService } from "../services/job-service"
import { clientService } from "@/modules/clients"
import { allocateDrawingNumberAsync, nextRefNumberAsync } from "@/shared/supabase/sequence-service"
import { isSupabaseOnly } from "@/shared/supabase/feature-flags"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { createId } from "@paralleldrive/cuid2"
import { CREATABLE_ITEM_TYPE_VALUES, isValidWorksType, OTHER_WORKS_TYPE, REF_PREFIX_BY_ITEM_TYPE, sanitizeJobTags } from "@/lib/constants"
import { requireModuleAccess, requireRole, actorName } from "@/shared/auth/auth"
import { MAX_JOB_LIST_EXPORT_ROWS } from "@/modules/import-export/constants"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import { enrichRevisionFamily, compareRevisionLetters } from "@/lib/revision-chain"
import { ensureSequencesSeeded } from "@/shared/supabase/seed-sequences"
import { holdService } from "@/modules/clients/hold/services/hold-service"
import { siteService, formatSiteAddress } from "@/modules/sites"
import { apiInternalError } from "@/shared/api-errors"
import { checkRateLimit, rateLimitedResponse, RATE_PRESETS } from "@/shared/auth/rate-limit"
import { parsePageParam, parseLimitParam } from "@/shared/utils/pagination"
import { enrichJobsWithLinkedQuotes } from "./enrich-linked-quotes"
import { resolveDirectoryDesigner } from "../services/designer-directory"
import { todayIsoDate, addDaysToIsoDate } from "@/shared/utils/utils"

/**
 * Revision family flags. Also attaches *display* fields for the current
 * work item (status/designer/deadline/value) without overwriting the parent
 * job's own status — project vs revision workflows stay independent.
 *
 * Current work priority (mirrors modules/jobs/lib/current-work.ts):
 * 1. Latest active (non-ISSUED) revision by revision letter sequence
 * 2. Else the original, when still active
 * 3. Else none — currentStatus stays ISSUED for filter/display helpers
 */
function flagRevisions<T extends {
  id: string
  parentJobId: string | null
  revisionLetter?: string | null
  status?: string
  designer?: string
  requiredByDate?: string | null
  updatedAt?: string
  dateCompleted?: string | null
  quoteValue?: number | null
}>(
  pageJobs: T[],
  revisionRows?: {
    id: string
    parentJobId: string | null
    revisionLetter?: string | null
    status?: string
    designer?: string | null
    requiredByDate?: string | null
    updatedAt?: string
    dateCompleted?: string | null
    quoteValue?: number | null
  }[],
): Array<ReturnType<typeof enrichRevisionFamily<T>>[number] & {
  currentStatus?: string
  currentDesigner?: string
  currentRequiredByDate?: string | null
  currentQuoteValue?: number | null
  currentWorkType?: "original" | "revision" | "none"
}> {
  const source = revisionRows ?? pageJobs.filter(j => j.parentJobId !== null)
  const enriched = enrichRevisionFamily(pageJobs, source)
  const byParent = new Map<string, typeof source>()
  for (const r of source) {
    if (!r.parentJobId) continue
    const list = byParent.get(r.parentJobId) ?? []
    list.push(r)
    byParent.set(r.parentJobId, list)
  }

  return enriched.map(job => {
    if (job.parentJobId !== null) {
      return {
        ...job,
        currentStatus: job.status,
        currentDesigner: job.designer,
        currentRequiredByDate: job.requiredByDate ?? null,
        currentQuoteValue: job.quoteValue ?? null,
        currentWorkType: job.status === "ISSUED" ? "none" : "revision",
      }
    }

    const revs = byParent.get(job.id) ?? []
    const activeRevs = revs.filter(r => r.status && r.status !== "ISSUED")
    let current: (typeof source)[number] | null = null
    if (activeRevs.length > 0) {
      current = [...activeRevs].sort((a, b) => {
        const byLetter = compareRevisionLetters(a.revisionLetter, b.revisionLetter)
        if (byLetter !== 0) return byLetter
        return String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""))
      }).at(-1) ?? null
    }

    if (current) {
      return {
        ...job,
        currentRevisionId: current.id,
        currentRevisionLetter: current.revisionLetter ?? null,
        currentStatus: current.status ?? job.status,
        currentDesigner: current.designer ?? job.designer,
        currentRequiredByDate: current.requiredByDate ?? job.requiredByDate ?? null,
        currentQuoteValue: current.quoteValue ?? job.quoteValue ?? null,
        currentWorkType: "revision" as const,
      }
    }

    if (job.status && job.status !== "ISSUED") {
      return {
        ...job,
        currentStatus: job.status,
        currentDesigner: job.designer,
        currentRequiredByDate: job.requiredByDate ?? null,
        currentQuoteValue: job.quoteValue ?? null,
        currentWorkType: "original" as const,
      }
    }

    return {
      ...job,
      currentStatus: job.status,
      currentDesigner: job.designer,
      currentRequiredByDate: job.requiredByDate ?? null,
      currentQuoteValue: job.quoteValue ?? null,
      currentWorkType: "none" as const,
    }
  })
}

function todayIso(): string {
  return todayIsoDate()
}

function weekStartIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return addDaysToIsoDate(d, mondayOffset)
}

function weekEndIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()
  const sundayOffset = dow === 0 ? 0 : 7 - dow
  return addDaysToIsoDate(d, sundayOffset)
}

/** Filter parent rows by their *current revision* display fields. */
function filterByCurrentDisplay<T extends {
  status: string
  designer?: string
  requiredByDate?: string | null
  parentJobId: string | null
  currentStatus?: string
  currentDesigner?: string
  currentRequiredByDate?: string | null
}>(
  jobs: T[],
  opts: {
    status?: string
    unassigned?: boolean
    overdue?: boolean
    dueToday?: boolean
    dueThisWeek?: boolean
  },
): T[] {
  const today = todayIso()
  const wkStart = weekStartIso()
  const wkEnd = weekEndIso()
  return jobs.filter(j => {
    const status = j.currentStatus ?? j.status
    const designer = j.currentDesigner ?? j.designer
    const due = j.currentRequiredByDate ?? j.requiredByDate
    if (opts.status && status !== opts.status) return false
    if (opts.unassigned && (designer ?? "").trim() !== "") return false
    if (status === "ISSUED") {
      if (opts.overdue || opts.dueToday || opts.dueThisWeek) return false
    }
    if (opts.overdue && !(due != null && due < today)) return false
    if (opts.dueToday && due !== today) return false
    if (opts.dueThisWeek && !(due != null && due >= wkStart && due <= wkEnd)) return false
    return true
  })
}

// Reference-number prefixes for non-drawing item types — sourced from WORK_ITEM_TYPES
const REF_PREFIXES = REF_PREFIX_BY_ITEM_TYPE

const createJobBodySchema = z.object({
  itemType: z.string().optional(),
  tags: z.unknown().optional(),
  siteId: z.string().optional(),
  siteName: z.string().optional(),
  siteAddress: z.string().optional(),
  address: z.string().optional(),
  clientCompany: z.string().optional(),
  clientId: z.string().optional(),
  requestedBy: z.string().optional(),
  typeOfWorks: z.string().optional(),
  customTypeDescription: z.string().optional(),
  designer: z.string().optional(),
  proceedDespiteHold: z.boolean().optional(),
  dateCompleted: z.union([z.string(), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  designStandards: z.union([z.string(), z.null()]).optional(),
  quoteValue: z.union([z.string(), z.number(), z.null()]).optional(),
  quoteReference: z.union([z.string(), z.null()]).optional(),
  quoteDate: z.union([z.string(), z.null()]).optional(),
  commercialNotes: z.union([z.string(), z.null()]).optional(),
  variationFees: z.union([z.string(), z.number(), z.null()]).optional(),
  additionalCharges: z.union([z.string(), z.number(), z.null()]).optional(),
  requestedDate: z.union([z.string(), z.null()]).optional(),
  requiredByDate: z.union([z.string(), z.null()]).optional(),
}).passthrough()

export async function GET(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const sp             = req.nextUrl.searchParams
    const search         = sp.get("search")        ?? ""
    const status         = sp.get("status")        ?? ""
    const itemType       = sp.get("itemType")      ?? ""
    const typeOfWorks    = sp.get("typeOfWorks")   ?? ""
    const unassigned     = sp.get("unassigned")    === "true"
    const onlyRevisions  = sp.get("onlyRevisions") === "true"
    const _includeRevisions = sp.get("includeRevisions") === "true"
    // One parent card per drawing by default — revisions stay in DB, not the list.
    const onlyOriginals = onlyRevisions
      ? false
      : sp.get("onlyOriginals") === "true"
    const overdue        = sp.get("overdue")        === "true"
    const dueToday       = sp.get("dueToday")       === "true"
    const dueThisWeek    = sp.get("dueThisWeek")    === "true"
    const page           = parsePageParam(sp.get("page"))
    const limit          = parseLimitParam(sp.get("limit"), 25, 100)
    const exportAll      = sp.get("export")        === "true"
    const sortBy         = sp.get("sortBy")        ?? "drawingNumber"
    const sortDir        = (sp.get("sortDir")      === "desc" ? "desc" : "asc") as "asc" | "desc"

    const clientId = sp.get("clientId") ?? ""
    const siteId = sp.get("siteId") ?? ""

    // Status / deadline / unassigned apply to the *current* revision when listing parents.
    const needsCurrentFilter = onlyOriginals && !!(status || unassigned || overdue || dueToday || dueThisWeek)

    const baseWhere = {
      ...(search        && { search }),
      ...(itemType      && { itemType }),
      ...(typeOfWorks   && { typeOfWorks }),
      ...(clientId      && { clientId }),
      ...(siteId        && { siteId }),
      ...(onlyOriginals && { onlyOriginals: true }),
      ...(onlyRevisions && { onlyRevisions: true }),
    }

    const where = {
      ...baseWhere,
      ...(!needsCurrentFilter && status && { status }),
      ...(!needsCurrentFilter && unassigned && { unassigned: true }),
      ...(!needsCurrentFilter && overdue && { overdue: true }),
      ...(!needsCurrentFilter && dueToday && { dueToday: true }),
      ...(!needsCurrentFilter && dueThisWeek && { dueThisWeek: true }),
    }

    if (exportAll) {
      const admin = await requireRole(["ADMIN"])
      if (admin instanceof NextResponse) return admin
      if (!(await checkRateLimit(`export:${admin.user.id}`, RATE_PRESETS.export))) {
        return rateLimitedResponse(3600)
      }
      const { jobs: rawJobs, total, allForRevisions } = await jobService.findManyWithCount({
        where: needsCurrentFilter ? baseWhere : where,
        orderBy: { field: sortBy, dir: sortDir },
        take: MAX_JOB_LIST_EXPORT_ROWS,
      })
      let jobs = flagRevisions(rawJobs, allForRevisions)
      if (needsCurrentFilter) {
        jobs = filterByCurrentDisplay(jobs, { status, unassigned, overdue, dueToday, dueThisWeek })
      }
      const enrichedExport = await enrichJobsWithLinkedQuotes(jobs)
      return listResponse({
        jobs: enrichedExport,
        total: needsCurrentFilter ? jobs.length : total,
        exported: jobs.length,
        truncated: !needsCurrentFilter && total > jobs.length,
      })
    }

    if (needsCurrentFilter) {
      const { jobs: rawJobs, allForRevisions } = await jobService.findManyWithCount({
        where: baseWhere,
        orderBy: { field: sortBy, dir: sortDir },
        take: MAX_JOB_LIST_EXPORT_ROWS,
      })
      let enriched = flagRevisions(rawJobs, allForRevisions)
      enriched = filterByCurrentDisplay(enriched, { status, unassigned, overdue, dueToday, dueThisWeek })
      const total = enriched.length
      const paged = enriched.slice((page - 1) * limit, page * limit)
      const jobs = await enrichJobsWithLinkedQuotes(paged)
      return listResponse({ jobs, total, page, limit })
    }

    const { jobs: rawJobs, total, allForRevisions } = await jobService.findManyWithCount({
      where,
      orderBy: { field: sortBy, dir: sortDir },
      skip: (page - 1) * limit,
      take: limit,
    })
    const paged = flagRevisions(rawJobs, allForRevisions)
    const jobs = await enrichJobsWithLinkedQuotes(paged)
    return listResponse({ jobs, total, page, limit })
  } catch (err) {
    return apiInternalError("jobs.list.get", err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
    const parsedBody = createJobBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as Record<string, unknown>

    // Determine item type (defaults to DESIGN). Survey/Inspection are no longer creatable.
    const requestedType = typeof body.itemType === "string" ? body.itemType : "DESIGN"
    if (requestedType !== "DESIGN" && !CREATABLE_ITEM_TYPE_VALUES.includes(requestedType as never)) {
      if (requestedType === "REVISION") {
        return NextResponse.json({ error: "Create revisions via POST /api/jobs/[parentId]/revisions" }, { status: 422 })
      }
      return NextResponse.json({
        error: `Cannot create jobs of type "${requestedType}". Choose Design, Site Visit, or CATIII Design Check.`,
        field: "itemType",
      }, { status: 422 })
    }
    const itemType = CREATABLE_ITEM_TYPE_VALUES.includes(requestedType as never)
      ? requestedType
      : "DESIGN"

    let tags: string[] = []
    if (body.tags !== undefined) {
      const sanitized = sanitizeJobTags(body.tags)
      if (sanitized === null) {
        return NextResponse.json({ error: "One or more tags are not in the approved list", field: "tags" }, { status: 422 })
      }
      tags = sanitized
    }

    // Required fields (all item types)
    let siteId: string | null = typeof body.siteId === "string" && body.siteId.trim()
      ? body.siteId.trim()
      : null
    let siteName = typeof body.siteName === "string" ? body.siteName.trim() : ""
    let siteAddress = typeof body.siteAddress === "string" ? body.siteAddress.trim() : ""

    for (const [field, message] of [
      ["clientCompany", "Client company is required"],
      ["requestedBy",   "Requested by is required"],
    ] as [string, string][]) {
      if (!body[field] || String(body[field]).trim() === "") {
        return NextResponse.json({ error: message, field }, { status: 422 })
      }
    }

    let resolvedClientId: string | null =
      typeof body.clientId === "string" && body.clientId.trim() ? body.clientId.trim() : null
    let resolvedClientCompany = String(body.clientCompany).trim()
    if (resolvedClientId) {
      const client = await clientService.findUnique(resolvedClientId)
      if (!client) return NextResponse.json({ error: "Client not found", field: "clientId" }, { status: 422 })
      resolvedClientCompany = client.name
    } else {
      const matched = await clientService.findByName(resolvedClientCompany)
      resolvedClientId = matched?.id ?? null
    }

    if (siteId) {
      if (!resolvedClientId) {
        return NextResponse.json({ error: "Client is required when selecting a site", field: "clientId" }, { status: 422 })
      }
      const site = await siteService.assertSiteBelongsToClient(siteId, resolvedClientId)
      if (!site) {
        return NextResponse.json({ error: "Site not found for this client", field: "siteId" }, { status: 422 })
      }
      siteName = site.name
      siteAddress = formatSiteAddress(site) || site.name
    } else if (!siteName && !siteAddress) {
      return NextResponse.json({ error: "Select or create a site", field: "siteId" }, { status: 422 })
    }

    const address = typeof body.address === "string" && body.address.trim()
      ? String(body.address).trim()
      : composeJobAddress(siteName, siteAddress)

    if (!address) {
      return NextResponse.json({ error: "Site name or address is required", field: "siteId" }, { status: 422 })
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
    const changedBy = actorName(auth.user)
    const designerResolved = await resolveDirectoryDesigner(
      typeof body.designer === "string" ? body.designer : "",
    )
    if (!designerResolved.ok) {
      return NextResponse.json({ error: designerResolved.error, field: "designer" }, { status: 422 })
    }
    const designer = designerResolved.designer

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
    if (!isSupabaseOnly()) await ensureSequencesSeeded()

    // Generate reference number based on item type
    let drawingNumber: string
    if (itemType === "DESIGN") {
      drawingNumber = await allocateDrawingNumberAsync()
    } else if (itemType === "REVISION") {
      // Revisions are created via POST /api/jobs/[id]/revisions — not here
      return NextResponse.json({ error: "Create revisions via POST /api/jobs/[parentId]/revisions" }, { status: 422 })
    } else {
    // Site Visit, CATIII Design Check, etc.
      const prefix = REF_PREFIXES[itemType]
      drawingNumber = await nextRefNumberAsync(prefix)
    }

    if (resolvedClientId && body.proceedDespiteHold !== true) {
      const hold = await holdService.activeHoldForClient(resolvedClientId)
      if (hold) {
        return NextResponse.json({
          error: "Client is on hold",
          onHold: true,
          holdReason: hold.reason,
        }, { status: 422 })
      }
    }

    const job = await jobService.create({
      id,
      drawingNumber,
      itemType,
      address,
      siteId,
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
      designStandards: body.designStandards ? String(body.designStandards).trim() : null,
      tags,
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

    if (siteId) {
      await siteService.logJobLinked({
        siteId,
        jobId: job.id,
        drawingNumber: job.drawingNumber,
        performedBy: auth.user.id,
        performedByName: changedBy,
      })
    }

    return NextResponse.json(job, { status: 201 })
  } catch (err) {
    return apiInternalError("jobs.list.create", err)
  }
}
