import { NextRequest, NextResponse } from "next/server"
import { jobService } from "@/lib/services/job-service"
import { clientService } from "@/lib/services/client-service"
import { VALID_STATUSES, isValidWorksType, OTHER_WORKS_TYPE } from "@/lib/constants"
import { getCurrentUser, requireRole } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(job)
  } catch (err) {
    console.error("[GET /api/jobs/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

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

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireRole(["ADMIN"])
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    if (!(await jobService.findUnique(id))) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const blockers = jobService.deletionBlockers(id)
    if (blockers.length > 0) {
      return NextResponse.json({ error: blockers.join(" ") }, { status: 409 })
    }

    const ok = await jobService.delete(id)
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[DELETE /api/jobs/[id]]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
