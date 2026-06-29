import { NextRequest, NextResponse } from "next/server"
import { jobService } from "@/lib/services/job-service"
import { clientService } from "@/lib/services/client-service"
import { VALID_STATUSES, isValidWorksType, OTHER_WORKS_TYPE } from "@/lib/constants"
import { requireSignIn, requireRole } from "@/lib/auth"
import { applyOptionalMoneyField } from "@/lib/api-money"
import { resourceResponse } from "@/lib/api-cache"
import { cancelRecordForJob } from "@/lib/cancel-record"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const payload = job.archivedAt
      ? { ...job, cancelRecord: cancelRecordForJob(id) }
      : job
    return resourceResponse(payload)
  } catch (err) {
    console.error("[GET /api/jobs/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    // Validate status if provided
    if (body.status && !VALID_STATUSES.includes(body.status as "NEW_REQUEST"|"IN_DESIGN"|"CHECKING"|"ISSUED")) {
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
      "address","typeOfWorks","customTypeDescription","clientCompany","requestedBy","status","designer","notes",
      "requestedDate","requiredByDate","quoteReference","quoteDate","commercialNotes",
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
    const changedBy = typeof body.changedBy === "string" && body.changedBy.trim()
      ? body.changedBy.trim() : "System"
    data.changedBy = changedBy

    if (Object.keys(data).length <= 1) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 })
    }

    const job = await jobService.update(id, data)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(job)
  } catch (err) {
    console.error("[PATCH /api/jobs/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
    console.error("[DELETE /api/jobs/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
