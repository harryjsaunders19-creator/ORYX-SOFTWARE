import { NextResponse } from "next/server"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { buildAccountsHandoverWorkbook, workbookToBuffer } from "@/lib/billing-export"
import { requireRole } from "@/lib/auth"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const batch = await billingHandoffService.findBatchUnique(id)
    if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const snapshots = await billingHandoffService.snapshotsForBatch(id)
    const wb  = await buildAccountsHandoverWorkbook(snapshots, {
      batchNumber: batch.batchNumber, exportDate: batch.exportDate, exportedBy: batch.exportedBy,
    })
    const buf = await workbookToBuffer(wb)

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="accounts-handover-${batch.batchNumber}.xlsx"`,
      },
    })
  } catch (err) {
    console.error("[GET /api/billing-handoffs/batches/[id]/xlsx]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
