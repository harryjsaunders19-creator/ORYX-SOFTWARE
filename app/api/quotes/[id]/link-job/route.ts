import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireModuleAccess } from "@/shared/auth/auth"
import { quoteService } from "@/modules/quotes"
import { apiInternalError } from "@/shared/api-errors"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  jobId: z.union([z.string(), z.null()]),
  confirmReassign: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await requireModuleAccess("quotes")
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    let bodyRaw: unknown
    try { bodyRaw = await req.json() }
    catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
    const parsed = bodySchema.safeParse(bodyRaw)
    if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 422 })
    const { jobId, confirmReassign } = parsed.data

    const quote = await quoteService.findUnique(id)
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })

    if (jobId) {
      const { jobService } = await import("@/modules/jobs")
      const job = await jobService.findUnique(jobId)
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 })

      if (quote.jobId && quote.jobId !== jobId && !confirmReassign) {
        return NextResponse.json({
          error: "Quote is already linked to another job",
          currentJobId: quote.jobId,
          requiresConfirmation: true,
        }, { status: 409 })
      }
    }

    const updated = await quoteService.setJobId(id, jobId)
    if (!updated) return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    return NextResponse.json(updated)
  } catch (err) {
    return apiInternalError("quotes.link-job", err)
  }
}
