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
 * GET /api/jobs/[id]/revisions
 * Returns all child Job rows for this parent (ordered by revisionLetter).
 */
import { NextRequest, NextResponse } from "next/server"
import { jobDb } from "@/lib/db"
import { nextRevisionLetter, REVISION_LETTERS } from "@/lib/constants"
import { createId } from "@paralleldrive/cuid2"
import { getCurrentUser } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params
    if (!jobDb.findUnique(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const revisions = jobDb.revisionsForJob(id)
    return NextResponse.json({ revisions })
  } catch (err) {
    console.error("[GET /api/jobs/[id]/revisions]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })

    const { id } = await params
    const parent = jobDb.findUnique(id)
    if (!parent) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // Can only create revisions on original jobs, not on revisions-of-revisions
    if (parent.parentJobId !== null) {
      return NextResponse.json(
        { error: "Cannot create a revision of a revision. Use the original job." },
        { status: 422 }
      )
    }

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* body is optional */ }

    // Find next letter from existing child jobs
    const existing    = jobDb.revisionsForJob(id)
    const usedLetters = existing.map(r => r.revisionLetter).filter(Boolean) as string[]

    // Optional explicit letter override
    let letter: string
    if (body.letter && typeof body.letter === "string") {
      letter = body.letter.toUpperCase()
      if (!REVISION_LETTERS.includes(letter)) {
        return NextResponse.json({ error: `Invalid revision letter: ${letter}` }, { status: 422 })
      }
      if (usedLetters.includes(letter)) {
        return NextResponse.json(
          { error: `Revision ${letter} already exists for this job` },
          { status: 409 }
        )
      }
    } else {
      letter = nextRevisionLetter(usedLetters)
    }

    const changedBy    = typeof body.changedBy === "string" && body.changedBy.trim()
      ? body.changedBy.trim() : "System"

    // The revision drawing number is the parent's number + " Rev A" etc.
    // If the parent itself already has " Rev " in its name (shouldn't happen due to
    // the check above, but guard anyway), strip it first.
    const baseDrawingNumber = parent.drawingNumber.replace(/ Rev [A-Z]$/, "")
    const revDrawingNumber  = `${baseDrawingNumber} Rev ${letter}`

    // Inherit site/client details from parent; start fresh with status/designer
    const revision = jobDb.create({
      id:             createId(),
      drawingNumber:  revDrawingNumber,
      itemType:       "REVISION",
      address:        parent.address,
      typeOfWorks:    parent.typeOfWorks,
      customTypeDescription: parent.customTypeDescription,
      clientCompany:  parent.clientCompany,
      requestedBy:    parent.requestedBy,
      status:         "NEW_REQUEST",
      designer:       "",                                      // unassigned
      dateCompleted:  null,
      notes:          body.notes ? String(body.notes).trim() : null,
      parentJobId:    parent.id,
      revisionLetter: letter,
      changedBy,
    })

    return NextResponse.json(revision, { status: 201 })
  } catch (err) {
    console.error("[POST /api/jobs/[id]/revisions]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
