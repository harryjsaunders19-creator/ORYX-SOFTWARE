"use client"
import { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Input } from "@/shared/ui/input"
import { Field } from "@/shared/ui/field"
import type { Job } from "@/lib/types"

export interface AddRevisionModalProps {
  job: Job | null
  onClose: () => void
  onSubmit: (job: Job, data: { notes: string; billable: boolean; quoteValue: number }) => Promise<void>
}

export function AddRevisionModal({ job, onClose, onSubmit }: AddRevisionModalProps) {
  const [notes, setNotes] = useState("")
  const [chargeable, setChargeable] = useState(true)
  const [fee, setFee] = useState("")
  const [saving, setSaving] = useState(false)
  const [notesError, setNotesError] = useState<string | null>(null)
  const [feeError, setFeeError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = notes.trim()
    let valid = true

    if (!trimmed) {
      setNotesError("Please enter the amendments required.")
      valid = false
    } else {
      setNotesError(null)
    }

    let quoteValue = 0
    if (chargeable) {
      const parsed = parseFloat(fee)
      if (!fee.trim() || isNaN(parsed)) {
        setFeeError("Enter the charge for this revision.")
        valid = false
      } else if (parsed < 0) {
        setFeeError("Fee cannot be negative.")
        valid = false
      } else {
        quoteValue = Math.round(parsed * 100) / 100
        setFeeError(null)
      }
    } else {
      quoteValue = 0
      setFeeError(null)
    }

    if (!valid || !job) return

    setSaving(true)
    try {
      await onSubmit(job, { notes: trimmed, billable: chargeable, quoteValue })
      setNotes("")
      setFee("")
      setChargeable(true)
    } finally {
      setSaving(false)
    }
  }

  const handleChargeableChange = (value: boolean) => {
    setChargeable(value)
    if (!value) {
      setFee("")
      setFeeError(null)
    }
  }

  return (
    <Dialog open={!!job} onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Add revision</DialogTitle>
          {job && (
            <DialogDescription>
              Revision for: <span className="font-mono font-semibold">{job.drawingNumber}</span>
              <br />
              Enter the amendments required and confirm whether the revision is chargeable.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <Field label="Amendments Required" error={notesError}>
              <Textarea
                value={notes}
                onChange={e => { setNotes(e.target.value); if (notesError) setNotesError(null) }}
                placeholder="Describe the changes or additional work required..."
                rows={4}
                autoFocus
              />
            </Field>

            <Field label="Is there a cost involved?">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleChargeableChange(true)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    chargeable
                      ? "bg-ac text-on-ac border-ac"
                      : "bg-sr text-t3 border-bd hover:text-t2"
                  }`}
                >
                  Yes — Chargeable
                </button>
                <button
                  type="button"
                  onClick={() => handleChargeableChange(false)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    !chargeable
                      ? "bg-ac text-on-ac border-ac"
                      : "bg-sr text-t3 border-bd hover:text-t2"
                  }`}
                >
                  No — Free revision
                </button>
              </div>
            </Field>

            {chargeable ? (
              <Field label="Revision fee" error={feeError}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-t3 pointer-events-none">£</span>
                  <Input
                    value={fee}
                    onChange={e => { setFee(e.target.value); if (feeError) setFeeError(null) }}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="pl-7"
                    autoComplete="off"
                  />
                </div>
              </Field>
            ) : (
              <p className="text-xs text-t3 px-1">
                This revision will be recorded with a fee of £0.00.
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving} disabled={saving}>
            {saving ? "Adding revision…" : "Add revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
