import { NextRequest, NextResponse } from "next/server"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { buildAccountsHandoverWorkbook, workbookToBuffer } from "@/lib/billing-export"
import { requireRole } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json() as { handoffIds?: string[]; exportedBy?: string; notes?: string | null }
    const handoffIds = Array.isArray(body.handoffIds) ? body.handoffIds : []
    if (!handoffIds.length) return NextResponse.json({ error: "No items selected" }, { status: 422 })

    const exportedBy = body.exportedBy ? String(body.exportedBy) : "System"
    const exportDate = new Date().toISOString().slice(0, 10)

    // This both creates the permanent batch + snapshot records and clears the
    // handoffs, atomically — see billingHandoffDb.createExportBatch(). The
    // workbook below is built from the snapshots this call just wrote, so a
    // batch with N records always pairs with a downloaded file describing
    // exactly those N records — never a mismatch.
    const { batch, snapshots } = await billingHandoffService.createExportBatch({
      handoffIds, exportedBy, exportDate, notes: body.notes ?? null,
    })

    const wb  = await buildAccountsHandoverWorkbook(snapshots, {
      batchNumber: batch.batchNumber, exportDate: batch.exportDate, exportedBy: batch.exportedBy,
    })
    const buf = await workbookToBuffer(wb)

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="accounts-handover-${batch.batchNumber}.xlsx"`,
        "X-Batch-Number": batch.batchNumber,
        "X-Batch-Id": batch.id,
      },
    })
  } catch (err) {
    console.error("[POST /api/billing-handoffs/export]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
