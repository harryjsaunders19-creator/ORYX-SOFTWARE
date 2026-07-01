/**
 * POST /api/quotes/[id]/convert
 * Converts an accepted quote into a new Job.
 * Body: { designer?, requiredByDate?, changedBy? }
 * Returns: { job, quote }
 */
import { NextRequest, NextResponse } from "next/server"
import { quoteService } from "../services/quote-service"
import { jobService } from "@/lib/services/job-service"
import { quoteDb, jobDb, sequenceDb, db } from "@/lib/db"
import { formatDrawingNumber, getYearMonthKey } from "@/lib/drawing-number"
import { createId } from "@paralleldrive/cuid2"
import { OTHER_WORKS_TYPE } from "@/lib/constants"
import { requireSignIn } from "@/shared/auth/auth"
import { resolveRequiredByDate } from "@/shared/utils/utils"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth
  try {
    const { id } = await params
    await quoteService.expirePastDue()
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
    const requiredByDate = resolveRequiredByDate(body.requiredByDate ? String(body.requiredByDate) : null)

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
        typeOfWorks:           quote.typeOfWorks && quote.typeOfWorks !== OTHER_WORKS_TYPE
          ? quote.typeOfWorks
          : OTHER_WORKS_TYPE,
        customTypeDescription: quote.typeOfWorks && quote.typeOfWorks !== OTHER_WORKS_TYPE
          ? null
          : (quote.customTypeDescription ?? quote.description).slice(0, 500),
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
