/**
 * POST /api/quotes/[id]/convert
 * Converts an accepted quote into a new Job.
 * Body: { designer?, requiredByDate?, proceedDespiteHold? }
 * Returns: { job, quote }
 */
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { quoteService } from "../services/quote-service"
import { createId } from "@paralleldrive/cuid2"
import { allocateDrawingNumberAsync } from "@/shared/supabase/sequence-service"
import { requireSignIn, actorName } from "@/shared/auth/auth"
import { resolveRequiredByDate } from "@/shared/utils/utils"
import { isSupabaseOnly, isWorkItemsModelEnabled } from "@/shared/supabase/feature-flags"
import { ensureSequencesSeeded } from "@/shared/supabase/seed-sequences"
import { ensureClientInSqlite } from "@/modules/clients"
import { holdService } from "@/modules/clients/hold/services/hold-service"
import { resolveWorksFromQuote } from "../convert-works"
import { validateQuoteForConvert, quoteConvertHoldResponse } from "../convert-validate"
import { convertQuoteToLegacyJob } from "../convert-atomic"
import { logError, logEvent } from "@/shared/logger"
import { apiInternalError } from "@/shared/api-errors"
import { parentJobService } from "@/modules/jobs/services/parent-work-item-service"
import { composeJobAddress } from "@/modules/job-map/utils/job-address"
import { resolveDirectoryDesigner } from "@/modules/jobs/services/designer-directory"

type Ctx = { params: Promise<{ id: string }> }

const convertQuoteBodySchema = z.object({
  designer: z.string().optional(),
  requiredByDate: z.union([z.string(), z.null()]).optional(),
  proceedDespiteHold: z.boolean().optional(),
}).passthrough()

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireSignIn()
  if (auth instanceof NextResponse) return auth
  try {
    const { id } = await params
    await quoteService.expirePastDue()
    const quote = await quoteService.findUnique(id)
    const validation = validateQuoteForConvert(quote)
    if (!validation.ok) {
      return NextResponse.json(validation.body, { status: validation.status })
    }

    let bodyRaw: unknown = {}
    try { bodyRaw = await req.json() } catch { /* body optional */ }
    const parsedBody = convertQuoteBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid request body", field: parsedBody.error.issues[0]?.path?.[0] }, { status: 422 })
    }
    const body = parsedBody.data as Record<string, unknown>

    const changedBy      = actorName(auth.user)
    const designerResolved = await resolveDirectoryDesigner(
      body.designer ? String(body.designer) : "",
    )
    if (!designerResolved.ok) {
      return NextResponse.json({ error: designerResolved.error, field: "designer" }, { status: 422 })
    }
    const designer = designerResolved.designer
    const requiredByDate = resolveRequiredByDate(body.requiredByDate ? String(body.requiredByDate) : null)
    const works          = resolveWorksFromQuote(quote!)
    const proceedDespiteHold = body.proceedDespiteHold === true

    if (quote!.clientId && !proceedDespiteHold) {
      const hold = await holdService.activeHoldForClient(quote!.clientId)
      if (hold) {
        const blocked = quoteConvertHoldResponse(hold.reason)
        return NextResponse.json(blocked.body, { status: blocked.status })
      }
    }

    if (!isSupabaseOnly()) {
      await ensureSequencesSeeded()
      await ensureClientInSqlite(quote!.clientId)
    }

    const jobId = createId()
    const drawingNumber = await allocateDrawingNumberAsync()
    const address = quote!.address?.trim() || "Address TBC"

    if (isWorkItemsModelEnabled()) {
      const dashboard = await parentJobService.createWithOriginal({
        id: jobId,
        drawingNumber,
        address,
        siteName: null,
        siteAddress: address,
        typeOfWorks: works.typeOfWorks,
        customTypeDescription: works.customTypeDescription,
        clientCompany: quote!.clientCompany,
        clientId: quote!.clientId ?? null,
        requestedBy: quote!.contactName ?? quote!.clientCompany,
        designer,
        notes: quote!.notes ?? null,
        quoteValue: quote!.quoteValue,
        quoteReference: quote!.quoteNumber,
        quoteDate: quote!.quoteDate,
        requiredByDate,
        changedBy,
      })

      const updatedQuote = await quoteService.linkToJob(id, dashboard.parent.id)
      if (!updatedQuote) {
        try {
          await parentJobService.deleteCreated(dashboard.parent.id)
        } catch (cleanupErr) {
          logError("quote.convert.work_items_rollback_failed", cleanupErr, {
            quoteId: id,
            jobId: dashboard.parent.id,
          })
        }
        logError("quote.convert.link_failed", new Error("quote link failed"), { quoteId: id, jobId })
        return NextResponse.json({ error: "Failed to link quote to job" }, { status: 500 })
      }

      // Best-effort: also set parent_job_id on the quote when column exists
      try {
        const { createAdminClient } = await import("@/shared/supabase/admin")
        await createAdminClient()
          .from("quotes")
          .update({ parent_job_id: dashboard.parent.id })
          .eq("id", id)
      } catch { /* optional column */ }

      logEvent("quote.convert.success", {
        quoteId: id,
        jobId: dashboard.parent.id,
        drawingNumber: dashboard.parent.drawingNumber,
        model: "work_items",
      })
      return NextResponse.json({
        job: {
          id: dashboard.parent.id,
          drawingNumber: dashboard.parent.drawingNumber,
          status: dashboard.currentActive?.status ?? "NEW_REQUEST",
        },
        parent: dashboard.parent,
        workItem: dashboard.workItems.find(w => w.workType === "ORIGINAL") ?? null,
        quote: updatedQuote,
      }, { status: 201 })
    }

    const { job, quote: updatedQuote } = await convertQuoteToLegacyJob(id, {
      id:             jobId,
      drawingNumber,
      itemType:       "DESIGN",
      address:        composeJobAddress(null, address) || address,
      typeOfWorks:           works.typeOfWorks,
      customTypeDescription: works.customTypeDescription,
      clientCompany:  quote!.clientCompany,
      clientId:       quote!.clientId ?? undefined,
      requestedBy:    quote!.contactName ?? quote!.clientCompany,
      status:         "NEW_REQUEST",
      designer,
      dateCompleted:  null,
      notes:          quote!.notes ?? null,
      quoteValue:     quote!.quoteValue,
      quoteReference: quote!.quoteNumber,
      quoteDate:      quote!.quoteDate,
      requiredByDate,
      parentJobId:    null,
      revisionLetter: null,
      changedBy,
    })

    logEvent("quote.convert.success", { quoteId: id, jobId: job.id, drawingNumber: job.drawingNumber })
    return NextResponse.json({ job, quote: updatedQuote }, { status: 201 })
  } catch (err) {
    return apiInternalError("quote.convert.error", err)
  }
}
