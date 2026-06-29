import { NextRequest, NextResponse } from "next/server"
import { billingHandoffService } from "@/lib/services/billing-handoff-service"
import { buildAccountsHandoverWorkbook, workbookToBuffer } from "@/lib/billing-export"
import { requireRole } from "@/lib/auth"

/** Large exports sync many handoffs + snapshots to Supabase — allow up to 60s. */
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = await requireRole(["ADMIN"])
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json() as { handoffIds?: string[]; exportedBy?: string; notes?: string | null }
    const handoffIds = Array.isArray(body.handoffIds) ? body.handoffIds : []
    if (!handoffIds.length) return NextResponse.json({ error: "No items selected" }, { status: 422 })

    const exportedBy = body.exportedBy ? String(body.exportedBy) : "System"
    const exportDate = new Date().toISOString().slice(0, 10)

    const { batch, snapshots } = await billingHandoffService.createExportBatch({
      handoffIds, exportedBy, exportDate, notes: body.notes ?? null,
    })

    if (!snapshots.length) {
      return NextResponse.json({ error: "Export produced no rows" }, { status: 500 })
    }

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
        "X-Record-Count": String(snapshots.length),
      },
    })
  } catch (err) {
    console.error("[POST /api/billing-handoffs/export]", err)
    const message =
      err instanceof Error
        ? err.message
        : err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
