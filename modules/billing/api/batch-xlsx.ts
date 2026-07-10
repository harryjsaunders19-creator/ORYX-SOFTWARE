import { NextResponse } from "next/server"import { apiInternalError } from "@/shared/api-errors"

import { billingHandoffService } from "../services/billing-handoff-service"
import { buildAccountsHandoverWorkbook, workbookToBuffer } from "../billing-export"
import { requireRole } from "@/shared/auth/auth"

export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const batch = await billingHandoffService.findBatchUnique(id)
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const snapshots = await billingHandoffService.snapshotsForBatch(id)
    if (!snapshots.length) {
      return NextResponse.json(
        { error: `Batch ${batch.batchNumber} has no export rows — re-export may be required` },
        { status: 404 },
      )
    }

    const wb  = await buildAccountsHandoverWorkbook(snapshots, {
      batchNumber: batch.batchNumber, exportDate: batch.exportDate, exportedBy: batch.exportedBy,
    })
    const buf = await workbookToBuffer(wb)

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="accounts-handover-${batch.batchNumber}.xlsx"`,
        "X-Record-Count": String(snapshots.length),
      },
    })
  } catch (err) {
    return apiInternalError("billing.api.batch_xlsx", err)
  }
}
