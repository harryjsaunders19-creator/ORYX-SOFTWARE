/**
 * POST /api/quotes/[id]/convert
 * Converts an accepted quote into a new Job.
 * Body: { designer?, requiredByDate? }
 * Returns: { job, quote }
 */
import { NextRequest, NextResponse } from "next/server"
import { quoteService } from "../services/quote-service"
import { jobService } from "@/lib/services/job-service"
import { createId } from "@paralleldrive/cuid2"
import { allocateDrawingNumber } from "@/lib/db"
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

    const changedBy      = auth.user.name
    const designer       = body.designer  ? String(body.designer).trim() : ""
    const requiredByDate = resolveRequiredByDate(body.requiredByDate ? String(body.requiredByDate) : null)

    const jobId = createId()
    const job = await jobService.create({
      id:             jobId,
      drawingNumber:  allocateDrawingNumber(),
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

    const updatedQuote = await quoteService.linkToJob(id, job.id)
    if (!updatedQuote) {
      console.error("[POST /api/quotes/[id]/convert] job created but quote link failed", { quoteId: id, jobId: job.id })
      return NextResponse.json({ error: "Failed to link quote to job" }, { status: 500 })
    }

    return NextResponse.json({ job, quote: updatedQuote }, { status: 201 })
  } catch (err) {
    console.error("[POST /api/quotes/[id]/convert]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
