/**
 * POST /api/jobs/[id]/revisions
 *
 * Creates a new revision of the given job.
 * The revision is a first-class Job row with:
 *   parentJobId    = parent job's id
 *   revisionLetter = next available letter (A, B, C …)
 *   drawingNumber  = "<parent drawingNumber> Rev <letter>"
 *   status         = NEW_REQUEST
 *   designer       = "" (unassigned)
 *
 * POST target must be the revision anchor:
 *   - the original job when no revisions exist yet, OR
 *   - the latest revision in the chain (e.g. Rev A to create Rev B).
 *
 * GET /api/jobs/[id]/revisions
 * Returns the full revision family: original, child revisions, timeline chain,
 * and canAddRevision flag. Back-compat `revisions` field preserved.
 */
import { NextRequest, NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { nextRevisionLetter, REVISION_LETTERS } from "@/lib/constants"
import { canAddRevisionFrom, buildRevisionFamilyIndex } from "@/lib/revision-chain"
import { revisionFamilyService } from "../services/revision-family-service"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { defaultRequiredByDate } from "@/shared/utils/utils"
import { apiInternalError } from "@/shared/api-errors"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const family = await revisionFamilyService.getForJob(id)
    if (!family) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Back-compat: `revisions` kept for existing callers; `chain` is the full timeline.
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
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
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

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* body is optional */ }

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
      parentJobId:    parent.id,
      revisionLetter: letter,
      requiredByDate: defaultRequiredByDate(),
      changedBy,
    })

    return NextResponse.json(revision, { status: 201 })
  } catch (err) {
    return apiInternalError("jobs.revisions.create", err)
  }
}
