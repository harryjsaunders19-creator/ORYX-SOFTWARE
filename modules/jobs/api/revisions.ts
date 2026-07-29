import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { jobService } from "../services/job-service"
import { nextRevisionLetter, REVISION_LETTERS } from "@/lib/constants"
import { canAddRevisionFrom, buildRevisionFamilyIndex } from "@/lib/revision-chain"
import { revisionFamilyService } from "../services/revision-family-service"
import { createId } from "@paralleldrive/cuid2"
import { requireModuleAccess, actorName } from "@/shared/auth/auth"
import { defaultRequiredByDate } from "@/shared/utils/utils"
import { apiInternalError } from "@/shared/api-errors"
import { isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"
import { parentJobService, workItemService } from "../services/parent-work-item-service"
import { resolveDirectoryDesigner } from "../services/designer-directory"

type Ctx = { params: Promise<{ id: string }> }

const createRevisionBodySchema = z.object({
  description: z.string().optional(),
  notes: z.string().optional(),
  designer: z.string().optional(),
  billable: z.union([z.boolean(), z.string()]).optional(),
  priority: z.string().nullable().optional(),
  letter: z.string().optional(),
}).passthrough()

async function resolveParentIdForWorkItems(id: string): Promise<string | null> {
  const dash = await parentJobService.getDashboard(id)
  if (dash) return dash.parent.id
  const wi = await workItemService.findUnique(id)
  return wi?.parentJobId ?? null
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    if (isWorkItemsModelEnabled()) {
      const parentId = await resolveParentIdForWorkItems(id)
      if (!parentId) return NextResponse.json({ error: "Not found" }, { status: 404 })
      const dash = await parentJobService.getDashboard(parentId)
      if (!dash) return NextResponse.json({ error: "Not found" }, { status: 404 })

      const chain = dash.workItems.map(w => ({
        id: w.id,
        drawingNumber: dash.parent.drawingNumber,
        revisionLetter: w.revisionLetter,
        isOriginal: w.workType === "ORIGINAL",
        isCurrent: dash.currentActive?.id === w.id,
        title: w.title,
        dateCreated: w.dateCreated,
        notes: w.notes ?? w.description,
        status: w.status,
        designer: w.designer,
        issuedBy: null,
        issuedAt: w.completedAt,
        billable: w.billable,
      }))

      return NextResponse.json({
        parentId: dash.parent.id,
        baseDrawingNumber: dash.parent.drawingNumber,
        original: dash.workItems.find(w => w.workType === "ORIGINAL") ?? null,
        revisions: dash.workItems.filter(w => w.workType === "REVISION"),
        chain,
        canAddRevision: dash.canAddRevision,
        nextRevisionLetter: dash.nextRevisionLetter,
      })
    }

    const family = await revisionFamilyService.getForJob(id)
    if (!family) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      parentId: family.parentId,
      baseDrawingNumber: family.baseDrawingNumber,
      original: family.original,
      revisions: family.revisions,
      chain: family.chain,
      canAddRevision: family.canAddRevision,
      nextRevisionLetter: family.nextRevisionLetter,
    })
  } catch (err) {
    return apiInternalError("jobs.revisions.get", err)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("jobs")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let bodyRaw: unknown = {}
    try { bodyRaw = await req.json() } catch { /* body is optional */ }
    const parsedBody = createRevisionBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as Record<string, unknown>

    if (isWorkItemsModelEnabled()) {
      const parentId = await resolveParentIdForWorkItems(id)
      if (!parentId) return NextResponse.json({ error: "Not found" }, { status: 404 })

      const reason = (
        typeof body.description === "string" ? body.description
        : typeof body.notes === "string" ? body.notes
        : ""
      ).trim()
      if (reason.length < 3) {
        return NextResponse.json(
          { error: "Reason for revision is required", field: "description" },
          { status: 422 },
        )
      }

      try {
        const designerResolved = await resolveDirectoryDesigner(
          typeof body.designer === "string" ? body.designer : "",
        )
        if (!designerResolved.ok) {
          return NextResponse.json({ error: designerResolved.error, field: "designer" }, { status: 422 })
        }
        const item = await parentJobService.createRevision(parentId, {
          description: reason,
          billable: body.billable === true || body.billable === "true",
          designer: designerResolved.designer,
          priority: typeof body.priority === "string" ? body.priority : null,
          notes: reason,
          changedBy: actorName(auth.user),
        })
        return NextResponse.json(item, { status: 201 })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create revision"
        if (/Reason for revision/i.test(msg)) {
          return NextResponse.json({ error: msg, field: "description" }, { status: 422 })
        }
        if (/not found|Cannot add/i.test(msg)) {
          return NextResponse.json({ error: msg }, { status: 400 })
        }
        throw err
      }
    }

    const source = await jobService.findUnique(id)
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parent = source.parentJobId
      ? await jobService.findUnique(source.parentJobId)
      : source
    if (!parent) return NextResponse.json({ error: "Parent job not found" }, { status: 404 })
    if (parent.archivedAt) {
      return NextResponse.json(
        { error: "Cannot create a revision for a cancelled job" },
        { status: 409 },
      )
    }
    if (parent.status !== "ISSUED") {
      return NextResponse.json(
        { error: "The original job must be marked complete before a revision can be added." },
        { status: 422 },
      )
    }

    const existing = await jobService.revisionsForJob(parent.id)
    const { latestByParent } = buildRevisionFamilyIndex(
      existing.map(r => ({ id: r.id, parentJobId: r.parentJobId, revisionLetter: r.revisionLetter })),
    )
    const latestMap = latestByParent as Map<string, { id: string; parentJobId: string | null }>

    if (!canAddRevisionFrom(source, latestMap)) {
      const latest = existing.at(-1)
      return NextResponse.json(
        {
          error: latest
            ? `Create the next revision from ${latest.drawingNumber} (the latest revision).`
            : "Create the first revision from the original job.",
        },
        { status: 422 },
      )
    }

    const usedLetters = existing.map(r => r.revisionLetter).filter(Boolean) as string[]

    let letter: string
    if (body.letter && typeof body.letter === "string") {
      letter = body.letter.toUpperCase()
      if (!REVISION_LETTERS.includes(letter)) {
        return NextResponse.json({ error: `Invalid revision letter: ${letter}` }, { status: 422 })
      }
      if (usedLetters.includes(letter)) {
        return NextResponse.json(
          { error: `Revision ${letter} already exists for this job` },
          { status: 409 },
        )
      }
    } else {
      letter = nextRevisionLetter(usedLetters)
    }

    const changedBy = actorName(auth.user)

    const baseDrawingNumber = parent.drawingNumber.replace(/ Rev [A-Z]$/, "")
    const revDrawingNumber  = `${baseDrawingNumber} Rev ${letter}`

    const revision = await jobService.create({
      id:             createId(),
      drawingNumber:  revDrawingNumber,
      itemType:       "REVISION",
      address:        parent.address,
      typeOfWorks:    parent.typeOfWorks,
      customTypeDescription: parent.customTypeDescription,
      clientCompany:  parent.clientCompany,
      requestedBy:    parent.requestedBy,
      status:         "NEW_REQUEST",
      designer:       "",
      dateCompleted:  null,
      notes:          body.notes ? String(body.notes).trim() : null,
      designStandards: parent.designStandards ?? null,
      parentJobId:    parent.id,
      revisionLetter: letter,
      billable:       false,
      requiredByDate: defaultRequiredByDate(),
      changedBy,
    })

    return NextResponse.json(revision, { status: 201 })
  } catch (err) {
    return apiInternalError("jobs.revisions.create", err)
  }
}
