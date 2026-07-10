/**
 * POST /api/quotes/[id]/convert
 * Converts an accepted quote into a new Job.
 * Body: { designer?, requiredByDate?, proceedDespiteHold? }
 * Returns: { job, quote }
 */
import { NextRequest, NextResponse } from "next/server"
import { quoteService } from "../services/quote-service"
import { jobService } from "@/lib/services/job-service"
import { createId } from "@paralleldrive/cuid2"
import { allocateDrawingNumber } from "@/lib/db"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { ensureSequencesSeeded } from "@/lib/supabase/seed-sequences"
import { ensureClientInSqlite } from "@/lib/services/client-service"
import { holdService } from "@/modules/clients/hold/services/hold-service"
import { errorMessage } from "@/shared/utils/error-message"
import { resolveWorksFromQuote } from "../convert-works"
import { logError, logEvent } from "@/shared/logger"

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

    const changedBy      = actorName(auth.user)
    const designer       = body.designer  ? String(body.designer).trim() : ""
    const requiredByDate = resolveRequiredByDate(body.requiredByDate ? String(body.requiredByDate) : null)
    const works          = resolveWorksFromQuote(quote)
    const proceedDespiteHold = body.proceedDespiteHold === true

    if (quote.clientId && !proceedDespiteHold) {
      const hold = await holdService.activeHoldForClient(quote.clientId)
      if (hold) {
        return NextResponse.json({
          error: "Client is on hold",
          onHold: true,
          holdReason: hold.reason,
        }, { status: 422 })
      }
    }

    await ensureSequencesSeeded()
    await ensureClientInSqlite(quote.clientId)

    const jobId = createId()
    const job = await jobService.create({
      id:             jobId,
      drawingNumber:  allocateDrawingNumber(),
      itemType:       "DESIGN",
      address:        quote.address?.trim() || "Address TBC",
      typeOfWorks:           works.typeOfWorks,
      customTypeDescription: works.customTypeDescription,
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
      logError("quote.convert.link_failed", new Error("quote link failed"), { quoteId: id, jobId: job.id })
      return NextResponse.json({ error: "Failed to link quote to job" }, { status: 500 })
    }

    logEvent("quote.convert.success", { quoteId: id, jobId: job.id, drawingNumber: job.drawingNumber })
    return NextResponse.json({ job, quote: updatedQuote }, { status: 201 })
  } catch (err) {
    logError("quote.convert.error", err)
    return NextResponse.json(
      { error: "Internal server error", detail: errorMessage(err) },
      { status: 500 },
    )
  }
}
