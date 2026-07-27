"use client"
import { useState } from "react"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { DesignerCombobox } from "@/components/designer-combobox"
import { useToast } from "@/shared/ui/toast"
import { defaultRequiredByDate, formatGBP } from "@/shared/utils/utils"
import type { Quote } from "@/lib/types"

// Perf: convert modal is only needed after "Create Job" — load in a separate chunk.

export function CreateJobFromQuoteModal({ quote, onClose, onConverted }: {
  quote: Quote
  onClose: () => void
  onConverted: () => void
}) {
  const { toast }     = useToast()
  const [designer,       setDesigner]       = useState("")
  const [requiredByDate, setRequiredByDate] = useState(defaultRequiredByDate)
  const [saving,         setSaving]         = useState(false)
  const [holdWarning,    setHoldWarning]    = useState<string | null>(null)

  const doConvert = async (proceedDespiteHold = false) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/quotes/${quote.id}/convert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designer: designer.trim(),
          requiredByDate: requiredByDate || null,
          proceedDespiteHold,
        }),
      })
      const body = await res.json() as {
        job?: { drawingNumber: string }
        error?: string
        detail?: string
        onHold?: boolean
        holdReason?: string
      }
      if (res.status === 422 && body.onHold) {
        setHoldWarning(body.holdReason ?? body.error ?? "This client is on hold")
        return
      }
      if (!res.ok) {
        const msg = body.detail?.trim() || body.error || "Failed to create job"
        toast(msg, "error")
        return
      }
      toast(`Job ${body.job?.drawingNumber} created from ${quote.quoteNumber}`, "success")
      onConverted()
    } catch { toast("Network error", "error") }
    finally { setSaving(false) }
  }

  const submit = () => { setHoldWarning(null); void doConvert(false) }
  const proceedDespiteHold = () => { setHoldWarning(null); void doConvert(true) }

  return (
    <>
    <Dialog open onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Create job from {quote.quoteNumber}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="bg-pg border border-bd rounded-md p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-t3 uppercase tracking-wider mb-1">Will be copied to the new job</p>
            <p className="text-xs text-t2"><span className="text-t4">Client:</span> {quote.clientCompany}</p>
            <p className="text-xs text-t2"><span className="text-t4">Address:</span> {quote.address}</p>
            <p className="text-xs text-t2"><span className="text-t4">Quote value:</span> {formatGBP(quote.quoteValue)}</p>
            <p className="text-xs text-t2"><span className="text-t4">Quote ref:</span> {quote.quoteNumber}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Drawing number</Label>
            <p className="text-xs text-t4 bg-pg border border-bd rounded-md px-3 py-2">
              Generated automatically when the job is created
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Designer</Label>
            <DesignerCombobox value={designer} onChange={setDesigner} placeholder="Select a user (optional)" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Required by date</Label>
            <Input type="date" value={requiredByDate} onChange={e => setRequiredByDate(e.target.value)} />
            <p className="text-xs text-t4">Defaults to 1 week from today if left blank</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            <ArrowRight className="h-3.5 w-3.5" /> Create job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {holdWarning && (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        <div className="bg-sr rounded-xl border-2 border-dn shadow-modal w-[calc(100vw-2rem)] max-w-[440px] overflow-hidden">
          <div className="bg-dn px-6 py-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-white shrink-0" />
            <div>
              <p className="text-base font-bold text-white">Client On Hold</p>
              <p className="text-white/85 text-xs mt-0.5">This client is restricted from receiving new work.</p>
            </div>
          </div>
          <div className="px-6 py-5">
            <div className="bg-dn-bg border border-dn-bd rounded-md px-4 py-3 mb-5">
              <p className="text-xs font-semibold text-dn uppercase tracking-wider mb-1">Reason</p>
              <p className="text-sm text-dn-tx font-medium">{holdWarning}</p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setHoldWarning(null)} disabled={saving}>Cancel</Button>
              <Button variant="danger" onClick={proceedDespiteHold} loading={saving}>Proceed anyway</Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

