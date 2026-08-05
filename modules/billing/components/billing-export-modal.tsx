"use client"
import { useState } from "react"
import { FileSpreadsheet } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Field } from "@/shared/ui/field"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { useToast } from "@/shared/ui/toast"
import { downloadResponse } from "./billing-download"

export function ExportModal({ ids, onClose, onExported }: {
  ids: string[]
  onClose: () => void
  onExported: (batchNumber: string) => void
}) {
  const { toast } = useToast()
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const count = ids.length

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/billing-handoffs/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoffIds: ids, notes: notes.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Export failed", "error")
        return
      }
      const batchNumber = res.headers.get("X-Batch-Number") ?? ""
      const recordCount = parseInt(res.headers.get("X-Record-Count") ?? "0", 10)
      await downloadResponse(res, "accounts-handover.xlsx")
      toast(`${batchNumber} exported — ${recordCount || count} item${count === 1 ? "" : "s"} cleared`, "success")
      onExported(batchNumber)
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error")
    }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="sm" showClose={!saving}>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="h-4 w-4 text-ac2" />
            <DialogTitle>Export Accounts Handover</DialogTitle>
          </div>
          <DialogDescription>{count} item{count === 1 ? "" : "s"} selected</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-t3">
            This downloads a complete workbook for accounts — client, project, commercial, revision, and audit
            details across all selected items — and creates a numbered billing batch. Once exported, these items
            move to Cleared and won&rsquo;t reappear here.
          </p>
          <Field label="Batch notes (optional)" htmlFor="billingBatchNotes">
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Weekly handover for w/e 21 June"
              rows={2} autoFocus
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" className="flex-1" loading={saving} onClick={() => void submit()}>
            {saving ? "Exporting…" : "Export & Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
