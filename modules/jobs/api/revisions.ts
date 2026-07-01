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
 * Returns all child Job rows for this parent (ordered by revisionLetter).
 */
import { NextRequest, NextResponse } from "next/server"
import { jobService } from "../services/job-service"
import { nextRevisionLetter, REVISION_LETTERS } from "@/lib/constants"
import { canAddRevisionFrom, buildLatestRevisionMap, revisionParentId } from "@/lib/revision-chain"
import { createId } from "@paralleldrive/cuid2"
import { requireSignIn } from "@/shared/auth/auth"
import { defaultRequiredByDate } from "@/shared/utils/utils"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const job = await jobService.findUnique(id)
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const parentId = revisionParentId(job)
    const revisions = await jobService.revisionsForJob(parentId)
    return NextResponse.json({ revisions })
  } catch (err) {
    console.error("[GET /api/jobs/[id]/revisions]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireSignIn()
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const source = await jobService.findUnique(id)
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const _parentId = revisionParentId(source)
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
    const latestMap = buildLatestRevisionMap(existing)

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

    const changedBy = typeof body.changedBy === "string" && body.changedBy.trim()
      ? body.changedBy.trim() : "System"

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
    console.error("[POST /api/jobs/[id]/revisions]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
