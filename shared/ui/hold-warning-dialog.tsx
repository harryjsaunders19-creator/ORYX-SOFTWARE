"use client"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from "@/shared/ui/dialog"

/** Confirm creating work for a client currently on hold. */
export function HoldWarningDialog({
  open,
  reason,
  saving,
  onCancel,
  onContinue,
  cancelLabel = "Cancel",
  continueLabel = "Continue anyway",
}: {
  open: boolean
  reason: string
  saving?: boolean
  onCancel: () => void
  onContinue: () => void
  cancelLabel?: string
  continueLabel?: string
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !saving) onCancel() }}>
      <DialogContent size="sm" showClose={!saving}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dn-bg border border-dn-bd">
              <AlertTriangle className="h-4 w-4 text-dn" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Client on hold</DialogTitle>
              <DialogDescription>
                This client is currently restricted from receiving new work.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogBody>
          <div className="bg-dn-bg border border-dn-bd rounded-md px-4 py-3 mb-4">
            <p className="text-xs font-semibold text-dn mb-1">Reason</p>
            <p className="text-sm text-dn-tx font-medium">{reason}</p>
          </div>
          <p className="text-sm text-t2">
            You may cancel and return to the form, or continue creating the job regardless.
            All actions are recorded.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="danger" className="flex-1" onClick={onContinue} loading={saving}>
            {continueLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
