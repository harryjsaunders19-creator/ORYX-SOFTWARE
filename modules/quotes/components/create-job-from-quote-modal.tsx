"use client"
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Field } from "@/shared/ui/field"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { HoldWarningDialog } from "@/shared/ui/hold-warning-dialog"
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
          <div className="bg-nested-surface border border-bd rounded-md p-3 space-y-1.5">
            <p className="type-label text-t3 mb-1">Will be copied to the new job</p>
            <p className="text-xs text-t2"><span className="text-t4">Client:</span> {quote.clientCompany}</p>
            <p className="text-xs text-t2"><span className="text-t4">Address:</span> {quote.address}</p>
            <p className="text-xs text-t2"><span className="text-t4">Quote value:</span> {formatGBP(quote.quoteValue)}</p>
            <p className="text-xs text-t2"><span className="text-t4">Quote ref:</span> {quote.quoteNumber}</p>
          </div>
          <Field label="Drawing number">
            <p className="text-xs text-t4 bg-nested-surface border border-bd rounded-md px-3 py-2">
              Generated automatically when the job is created
            </p>
          </Field>
          <Field label="Designer">
            <DesignerCombobox value={designer} onChange={setDesigner} placeholder="Select a user (optional)" autoFocus />
          </Field>
          <Field label="Required by date" hint="Defaults to 1 week from today if left blank">
            <Input type="date" value={requiredByDate} onChange={e => setRequiredByDate(e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            <ArrowRight className="h-3.5 w-3.5" /> Create job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <HoldWarningDialog
      open={!!holdWarning}
      reason={holdWarning ?? ""}
      saving={saving}
      onCancel={() => setHoldWarning(null)}
      onContinue={proceedDespiteHold}
      continueLabel="Proceed anyway"
    />
    </>
  )
}
