/**
 * POST /api/quotes/[id]/convert
 * Converts an accepted quote into a new Job.
 * Body: { designer?, requiredByDate?, changedBy? }
 * Returns: { job, quote }
 */
import { NextRequest, NextResponse } from "next/server"
import { quoteService } from "@/lib/services/quote-service"
import { jobService } from "@/lib/services/job-service"
import { quoteDb, jobDb, sequenceDb, db } from "@/lib/db"
import { formatDrawingNumber, getYearMonthKey } from "@/lib/drawing-number"
import { createId } from "@paralleldrive/cuid2"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { getCurrentUser } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Sign-in required" }, { status: 401 })
  try {
    const { id } = await params
    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    if (quote.status !== "ACCEPTED")
      return NextResponse.json({ error: "Only accepted quotes can be converted to jobs" }, { status: 422 })
    if (quote.jobId)
      return NextResponse.json({ error: "This quote has already been converted to a job" }, { status: 409 })

    let body: Record<string, unknown> = {}
    try { body = await req.json() } catch { /* body optional */ }

    const changedBy      = body.changedBy ? String(body.changedBy) : "System"
    const designer       = body.designer  ? String(body.designer).trim() : ""
    const requiredByDate = body.requiredByDate ? String(body.requiredByDate) : null

    const { year, month, key } = getYearMonthKey()
    const seq           = sequenceDb.nextSequence(key)
    const drawingNumber = formatDrawingNumber(year, month, seq)
    const jobId         = createId()

    // Create the job and link the quote to it in a single transaction — if either
    // write fails, both roll back, so the quote can never end up created-but-unlinked
    // (which would let it be converted a second time, producing a duplicate job).
    const { job, quote: updatedQuote } = db.transaction(() => {
      const job = jobDb.create({
        id:             jobId,
        drawingNumber,
        itemType:       "DESIGN",
        address:        quote.address,
        // Quote descriptions are free text, written before the controlled
        // Type of Works list existed for this job — they can't be reliably
        // auto-classified into one of the approved categories, so this
        // always goes through Other + the real description rather than
        // putting free text into the now-controlled typeOfWorks field.
        // Whoever picks up the new job can recategorise it properly once
        // they know the actual scope.
        typeOfWorks:           OTHER_WORKS_TYPE,
        customTypeDescription: quote.description.slice(0, 500),
        clientCompany:  quote.clientCompany,
        clientId:       quote.clientId ?? undefined,
        requestedBy:    quote.contactName ?? quote.clientCompany,
        status:         "NEW_REQUEST",
        designer,
        dateCompleted:  null,
        notes:          quote.notes ?? null,
        quoteValue:     quote.quoteValue,
        quoteReference: quote.quoteNumber,
        quoteDate:      quote.quoteDate,
        requiredByDate,
        parentJobId:    null,
        revisionLetter: null,
        changedBy,
      })
      const updatedQuote = quoteDb.update(id, { jobId })
      return { job, quote: updatedQuote }
    })()

    await jobService.syncFromSqlite(job.id)
    await quoteService.syncFromSqlite(id)

    return NextResponse.json({ job, quote: updatedQuote }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/quotes/[id]/convert]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
