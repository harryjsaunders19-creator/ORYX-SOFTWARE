import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { billingHandoffService } from "../services/billing-handoff-service"
import { buildAccountsHandoverWorkbook, workbookToBuffer } from "../billing-export"
import { requireFullAccess, actorName } from "@/shared/auth/auth"
import { logEvent } from "@/shared/logger"
import { apiInternalError } from "@/shared/api-errors"
import { checkRateLimit, rateLimitedResponse, RATE_PRESETS } from "@/shared/auth/rate-limit"

/** Large exports sync many handoffs + snapshots to Supabase — allow up to 60s. */
export const maxDuration = 60

const billingExportBodySchema = z.object({
  handoffIds: z.array(z.string().min(1)).min(1, "No items selected"),
  notes: z.union([z.string(), z.null()]).optional(),
}).passthrough()

export async function POST(req: NextRequest) {
  const auth = await requireFullAccess()
  if (auth instanceof NextResponse) return auth

  if (!(await checkRateLimit(`billing-export:${auth.user.id}`, RATE_PRESETS.billingExport))) {
    return rateLimitedResponse(3600)
  }

  try {
    const bodyRaw = await req.json()
    const parsedBody = billingExportBodySchema.safeParse(bodyRaw)
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]
      return NextResponse.json({ error: issue?.message ?? "Invalid request body", field: issue?.path?.[0] }, { status: 422 })
    }
    const { handoffIds, notes } = parsedBody.data

    const exportedBy = actorName(auth.user)
    const exportDate = new Date().toISOString().slice(0, 10)

    const { batch, snapshots } = await billingHandoffService.createExportBatch({
      handoffIds, exportedBy, exportDate, notes: notes ?? null,
    })

    if (!snapshots.length) {
      return NextResponse.json({ error: "Export produced no rows" }, { status: 500 })
    }

    const wb  = await buildAccountsHandoverWorkbook(snapshots, {
      batchNumber: batch.batchNumber, exportDate: batch.exportDate, exportedBy: batch.exportedBy,
    })
    const buf = await workbookToBuffer(wb)

    logEvent("billing.export.success", {
      batchNumber: batch.batchNumber,
      recordCount: snapshots.length,
      exportedBy,
    })

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="accounts-handover-${batch.batchNumber}.xlsx"`,
        "X-Batch-Number": batch.batchNumber,
        "X-Batch-Id": batch.id,
        "X-Record-Count": String(snapshots.length),
      },
    })
  } catch (err) {
    return apiInternalError("billing.export.error", err)
  }
}
