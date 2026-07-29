"use client"
import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/shared/ui/toast"
import { formatDisplayDate } from "@/shared/utils/utils"
import type { BillingExportBatch } from "@/lib/types"
import { downloadResponse } from "./billing-download"

export function BatchRow({ batch }: { batch: BillingExportBatch }) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)
  const redownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/billing-handoffs/batches/${batch.id}/xlsx`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to download", "error")
        return
      }
      await downloadResponse(res, `${batch.batchNumber}.xlsx`)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error")
    }
    finally { setDownloading(false) }
  }
  return (
    <tr className="hover:bg-pg">
      <td className="px-4 py-3 type-drawing-number text-ac whitespace-nowrap font-semibold">{batch.batchNumber}</td>
      <td className="px-4 py-3 text-t3 tabular-nums whitespace-nowrap">{formatDisplayDate(batch.exportDate)}</td>
      <td className="px-4 py-3 text-t2 whitespace-nowrap">{batch.exportedBy}</td>
      <td className="px-4 py-3 text-t1 font-medium tabular-nums whitespace-nowrap">{batch.recordCount}</td>
      <td className="px-4 py-3 text-t3 max-w-[260px] truncate">{batch.notes || "—"}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button onClick={redownload} disabled={downloading} className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 disabled:opacity-50">
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </button>
      </td>
    </tr>
  )
}

export function BatchMobileCard({ batch }: { batch: BillingExportBatch }) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)
  const redownload = async () => {
    setDownloading(true)
    try {
      const res = await fetch(`/api/billing-handoffs/batches/${batch.id}/xlsx`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to download", "error")
        return
      }
      await downloadResponse(res, `${batch.batchNumber}.xlsx`)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error")
    }
    finally { setDownloading(false) }
  }

  return (
    <div className="rounded-xl border border-bd bg-sr shadow-card p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="type-drawing-number type-badge text-ac">{batch.batchNumber}</span>
          <p className="text-xs text-t3 mt-1 tabular-nums">{formatDisplayDate(batch.exportDate)}</p>
        </div>
        <span className="text-sm font-semibold text-t1 tabular-nums">{batch.recordCount} rows</span>
      </div>
      <p className="text-xs text-t2">{batch.exportedBy}</p>
      {batch.notes && <p className="text-xs text-t3 line-clamp-2">{batch.notes}</p>}
      <button
        onClick={redownload}
        disabled={downloading}
        className="text-xs text-ac hover:text-ach font-medium inline-flex items-center gap-1 disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Download
      </button>
    </div>
  )
}
