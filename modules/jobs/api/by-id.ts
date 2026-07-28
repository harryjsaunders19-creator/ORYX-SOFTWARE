import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { jobService } from "../services/job-service"
import { clientService } from "@/modules/clients"
import { VALID_STATUSES, isValidWorksType, OTHER_WORKS_TYPE, sanitizeJobTags, type JobStatusValue } from "@/lib/constants"
import { requireModuleAccess, requireRole, actorName } from "@/shared/auth/auth"
import { applyOptionalMoneyField } from "@/shared/utils/api-money"
import { resourceResponse } from "@/shared/utils/api-cache"
import { cancelRecordForJob } from "@/modules/archive/cancel-record"
import { apiInternalError } from "@/shared/api-errors"
import { billingHandoffService } from "@/modules/billing"
import { resolveDirectoryDesigner } from "../services/designer-directory"

type Ctx = { params: Promise<{ id: string }> }

const patchJobBodySchema = z.object({
  address: z.string().optional(),
  siteName: z.union([z.string(), z.null()]).optional(),
  siteAddress: z.union([z.string(), z.null()]).optional(),
  typeOfWorks: z.string().optional(),
  customTypeDescription: z.union([z.string(), z.null()]).optional(),
  clientCompany: z.string().optional(),
  clientId: z.union([z.string(), z.null()]).optional(),
  requestedBy: z.string().optional(),
  status: z.string().optional(),
  designer: z.union([z.string(), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
  designStandards: z.union([z.string(), z.null()]).optional(),
  requestedDate: z.union([z.string(), z.null()]).optional(),
  requiredByDate: z.union([z.string(), z.null()]).optional(),
  quoteReference: z.union([z.string(), z.null()]).optional(),
  quoteDate: z.union([z.string(), z.null()]).optional(),
  commercialNotes: z.union([z.string(), z.null()]).optional(),
  billable: z.boolean().optional(),
  tags: z.unknown().optional(),
  dateCompleted: z.union([z.string(), z.null()]).optional(),
  quoteValue: z.union([z.string(), z.number(), z.null()]).optional(),
  variationFees: z.union([z.string(), z.number(), z.null()]).optional(),
  additionalCharges: z.union([z.string(), z.number(), z.null()]).optional(),
}).passthrough()

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const payload = job.archivedAt
      ? { ...job, cancelRecord: await cancelRecordForJob(id) }
      : job

    const include = new Set(
      (req.nextUrl.searchParams.get("include") ?? "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean),
    )
    if (include.size === 0) return resourceResponse(payload)

    const result: Record<string, unknown> = { ...payload }
    if (include.has("parent")) {
      result.parentJob = job.parentJobId
        ? await jobService.findUnique(job.parentJobId)
        : null
    }
    // Parent project view: expose the active (latest) revision for status/designer UX.
    if (!job.parentJobId) {
      const revs = await jobService.revisionsForJob(job.id)
      const latest = [...revs].sort((a, b) =>
        (a.revisionLetter ?? "").localeCompare(b.revisionLetter ?? ""),
      ).at(-1) ?? null
      result.currentRevision = latest
      result.currentRevisionId = latest?.id ?? job.id
      result.currentRevisionLetter = latest?.revisionLetter ?? null
      result.hasRevisions = revs.length > 0
      result.revisionCount = revs.length
      if (latest) {
        result.status = latest.status
        result.designer = latest.designer
        result.requiredByDate = latest.requiredByDate
        result.dateCompleted = latest.dateCompleted
        result.updatedAt = latest.updatedAt
        result.notes = latest.notes
        result.designStandards = latest.designStandards
        result.billable = latest.billable
      }
    }
    if (include.has("billing") && auth.user.role === "ADMIN") {
      const sourceId = (result.currentRevisionId as string | undefined) ?? id
      result.billingHandoff = await billingHandoffService.findBySourceJobId(sourceId)
    }
    return resourceResponse(result)
  } catch (err) {
    return apiInternalError("jobs.by_id.get", err)
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const parsedBody = patchJobBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as Record<string, unknown>

    // Validate status if provided
    if (body.status && !VALID_STATUSES.includes(body.status as JobStatusValue)) {
      return NextResponse.json({
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
      }, { status: 422 })
    }

    const existing = await jobService.findUnique(id)
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (existing.archivedAt) {
      return NextResponse.json({ error: "This job is cancelled and cannot be edited" }, { status: 409 })
    }

    const allowed = [
      "address", "siteName", "siteAddress", "typeOfWorks", "customTypeDescription", "clientCompany", "requestedBy", "status", "designer", "notes", "designStandards",
      "requestedDate","requiredByDate","quoteReference","quoteDate","commercialNotes", "billable", "tags",
    ]

    const data: Record<string, unknown> = {}
    for (const f of allowed) {
      if (body[f] !== undefined) data[f] = body[f]
    }

    // typeOfWorks must stay within the approved list, and "Other" always
    // needs a description — checked against the *effective* post-patch
    // state (existing value merged with whatever this request is changing),
    // since a request might change one field without touching the other.
    if (body.typeOfWorks !== undefined) {
      const t = String(body.typeOfWorks).trim()
      if (!isValidWorksType(t)) {
        return NextResponse.json({ error: "Type of works must be one of the approved values", field: "typeOfWorks" }, { status: 422 })
      }
      data.typeOfWorks = t
      // Switching away from Other makes any previous custom description
      // meaningless — clear it rather than leave stale text behind, unless
      // this same request is also explicitly setting a new one (handled by
      // the loop above already having picked up body.customTypeDescription).
      if (t !== OTHER_WORKS_TYPE && body.customTypeDescription === undefined) {
        data.customTypeDescription = null
      }
    }
    const effectiveTypeOfWorks  = data.typeOfWorks !== undefined ? data.typeOfWorks : existing.typeOfWorks
    const effectiveCustomDesc   = data.customTypeDescription !== undefined ? data.customTypeDescription : existing.customTypeDescription
    if (effectiveTypeOfWorks === OTHER_WORKS_TYPE && (!effectiveCustomDesc || String(effectiveCustomDesc).trim() === "")) {
      return NextResponse.json({ error: "Please specify the type of works", field: "customTypeDescription" }, { status: 422 })
    }
    if (body.dateCompleted !== undefined) {
      data.dateCompleted = body.dateCompleted ? String(body.dateCompleted) : null
    }
    if (body.designer !== undefined) {
      const resolved = await resolveDirectoryDesigner(
        body.designer == null ? "" : String(body.designer),
      )
      if (!resolved.ok) {
        return NextResponse.json({ error: resolved.error, field: "designer" }, { status: 422 })
      }
      data.designer = resolved.designer
    }
    if (body.billable !== undefined) {
      data.billable = Boolean(body.billable)
    }
    if (body.tags !== undefined) {
      const sanitized = sanitizeJobTags(body.tags)
      if (sanitized === null) {
        return NextResponse.json({ error: "One or more tags are not in the approved list", field: "tags" }, { status: 422 })
      }
      data.tags = sanitized
    }

    // Resolve clientId and sync clientCompany
    if (body.clientId !== undefined) {
      const cid = body.clientId ? String(body.clientId).trim() : null
      data.clientId = cid
      if (cid) {
        const client = await clientService.findUnique(cid)
        if (client && !data.clientCompany) data.clientCompany = client.name
      }
    } else if (body.clientCompany && !data.clientId) {
      const client = await clientService.findByName(String(body.clientCompany))
      if (client) data.clientId = client.id
    }

    if (body.quoteValue !== undefined) {
      if (body.quoteValue === null || body.quoteValue === "") {
        data.quoteValue = null
      } else {
        const parsed = parseFloat(String(body.quoteValue))
        if (!isNaN(parsed) && parsed < 0) {
          return NextResponse.json({ error: "Quote value can't be negative" }, { status: 422 })
        }
        data.quoteValue = isNaN(parsed) ? null : Math.round(parsed * 100) / 100
      }
    }
    for (const field of ["variationFees", "additionalCharges"] as const) {
      const err = applyOptionalMoneyField(body, field, data)
      if (err) return err
    }
    data.changedBy = actorName(auth.user)

    if (Object.keys(data).length <= 1) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const job = await jobService.update(id, data)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(job)
  } catch (err) {
    return apiInternalError("jobs.by_id.patch", err)
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (job.archivedAt) {
      return NextResponse.json({ error: "This job is already cancelled" }, { status: 409 })
    }

    let body: { reason?: string } = {}
    try { body = await req.json() } catch { /* empty body */ }

    const reason = typeof body.reason === "string" ? body.reason.trim() : ""
    if (reason.length < 3) {
      return NextResponse.json(
        { error: "A cancellation reason is required (at least 3 characters)" },
        { status: 422 },
      )
    }

    const archiverId   = auth.user.id
    const archiverName = auth.user.name

    const archived = await jobService.archive(id, archiverId, archiverName, reason)
    if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true, archived: true, job: archived })
  } catch (err) {
    return apiInternalError("jobs.by_id.delete", err)
  }
}
