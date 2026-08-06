"use client"

import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Field } from "@/shared/ui/field"
import type { Job } from "@/lib/types"
import { JOB_STATUSES } from "@/lib/constants"

function statusLabel(status: string | undefined): string {
  if (!status) return "—"
  return JOB_STATUSES.find(s => s.value === status)?.label ?? status
}

export function JobsCancelDialog({
  job,
  open,
  deleting,
  cancelReason,
  cancelNotes,
  onReasonChange,
  onNotesChange,
  onClose,
  onConfirm,
}: {
  job: Job | null
  open: boolean
  deleting: boolean
  cancelReason: string
  cancelNotes: string
  onReasonChange: (value: string) => void
  onNotesChange: (value: string) => void
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !deleting) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Cancel job</DialogTitle>
          <DialogDescription>
            Soft-cancel this job. It moves to <strong>Archived Items</strong>; the drawing
            number is kept and will not be reused. Quotes, revisions, attachments and
            invoicing history are preserved. You can restore it later from Archive.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {job && (
            <dl className="rounded-lg border border-bd bg-pg/40 px-3 py-2.5 text-xs space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-t3">Drawing</dt>
                <dd className="type-drawing-number font-semibold text-ac">{job.drawingNumber}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-t3">Client</dt>
                <dd className="text-t1 text-right">{job.clientCompany || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-t3">Site</dt>
                <dd className="text-t1 text-right max-w-[220px] truncate">{job.address || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-t3">Status</dt>
                <dd className="text-t1">{statusLabel(job.status)}</dd>
              </div>
            </dl>
          )}
          <Field label="Reason for cancellation" required htmlFor="jobs-cancel-reason">
            <Textarea
              id="jobs-cancel-reason"
              value={cancelReason}
              onChange={e => onReasonChange(e.target.value)}
              placeholder="e.g. Client withdrew, duplicate entry, project cancelled…"
              rows={3}
              autoFocus
            />
          </Field>
          <Field label="Internal notes (optional)" htmlFor="jobs-cancel-notes">
            <Textarea
              id="jobs-cancel-notes"
              value={cancelNotes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Optional context for the audit trail…"
              rows={2}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Keep job
          </Button>
          <Button
            variant="danger"
            onClick={() => { void onConfirm() }}
            loading={deleting}
            disabled={deleting || cancelReason.trim().length < 3}
          >
            {deleting ? "Cancelling…" : "Cancel job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
