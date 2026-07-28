"use client"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"
import { Label } from "@/shared/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import { DesignerCombobox } from "@/components/designer-combobox"
import { cn } from "@/shared/utils/utils"

interface CreateRevisionDialogProps {
  open: boolean
  saving: boolean
  nextRevisionLetter: string | null
  drawingNumber: string
  description: string
  descError: string | null
  designer: string
  priority: string
  billable: boolean
  onDescriptionChange: (value: string) => void
  onDesignerChange: (value: string) => void
  onPriorityChange: (value: string) => void
  onBillableChange: (value: boolean) => void
  onClose: () => void
  onCreate: () => void
}

export function CreateRevisionDialog({
  open,
  saving,
  nextRevisionLetter,
  drawingNumber,
  description,
  descError,
  designer,
  priority,
  billable,
  onDescriptionChange,
  onDesignerChange,
  onPriorityChange,
  onBillableChange,
  onClose,
  onCreate,
}: CreateRevisionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => {
      if (!saving) {
        if (!o) onClose()
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Create Revision{nextRevisionLetter ? ` ${nextRevisionLetter}` : ""}
          </DialogTitle>
          <DialogDescription>
            Adds active work on {drawingNumber}. The Parent Job stays the same — explain what the client asked for.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-bd bg-pg px-3 py-2 text-xs text-t3 space-y-1">
            <p>
              New work item:{" "}
              <span className="font-semibold text-t1">Revision {nextRevisionLetter}</span>
            </p>
            <p>Starts as New Request. Mark Chargeable only if this revision should be invoiced separately.</p>
          </div>
          <div>
            <Label>
              Reason for revision<span className="text-dn ml-0.5">*</span>
            </Label>
            <p className="type-helper text-t4 mt-0.5 mb-2">
              What did the client request? This appears on the project timeline for the whole team.
            </p>
            <Textarea
              className={cn("mt-0", descError && "border-dn")}
              rows={4}
              value={description}
              onChange={e => {
                onDescriptionChange(e.target.value)
              }}
              placeholder="e.g. Client phoned — change bay spacing and add loading calcs on first floor"
              autoFocus
            />
            {descError && <p className="text-xs text-dn mt-1">{descError}</p>}
          </div>
          <div>
            <Label>Designer</Label>
            <div className="mt-2">
              <DesignerCombobox value={designer} onChange={onDesignerChange} />
            </div>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority || "__none"} onValueChange={v => onPriorityChange(v === "__none" ? "" : v)}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-t2">
            <input type="checkbox" checked={billable} onChange={e => onBillableChange(e.target.checked)} />
            Chargeable — bill this revision separately
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!description.trim()}
            onClick={onCreate}
          >
            Create Revision{nextRevisionLetter ? ` ${nextRevisionLetter}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
