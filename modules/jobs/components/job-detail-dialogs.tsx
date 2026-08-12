"use client"
import dynamic from "next/dynamic"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { Button } from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import type { Job, JobFormData } from "@/lib/types"

const AssignDesignerModal = dynamic(
  () => import("@/components/assign-designer-modal").then(m => m.AssignDesignerModal),
  { ssr: false },
)
const JobForm = dynamic(
  () => import("./job-form").then(m => m.JobForm),
  { ssr: false },
)

interface JobDetailDialogsProps {
  job: Job
  workflowJobId: string
  isRevision: boolean
  // Assign dialog
  assignOpen: boolean
  onAssignClose: () => void
  onAssignSaved: (updated: { designer: string }) => void
  // Edit dialog
  editOpen: boolean
  editSaving: boolean
  onEditClose: () => void
  onEditSubmit: (form: JobFormData) => Promise<void>
  // Cancel dialog
  delOpen: boolean
  deleting: boolean
  cancelReason: string
  onCancelReasonChange: (value: string) => void
  onDeleteClose: () => void
  onDelete: () => void
  // Drawing number edit dialog (admin only)
  dnEditOpen: boolean
  dnEditSaving: boolean
  dnEditValue: string
  onDnEditValueChange: (value: string) => void
  onDnEditClose: () => void
  onDnEditSave: () => Promise<void>
}

export function JobDetailDialogs({
  job,
  workflowJobId,
  isRevision,
  assignOpen,
  onAssignClose,
  onAssignSaved,
  editOpen,
  editSaving,
  onEditClose,
  onEditSubmit,
  delOpen,
  deleting,
  cancelReason,
  onCancelReasonChange,
  onDeleteClose,
  onDelete,
  dnEditOpen,
  dnEditSaving,
  dnEditValue,
  onDnEditValueChange,
  onDnEditClose,
  onDnEditSave,
}: JobDetailDialogsProps) {
  return (
    <>
      {/* Assign designer */}
      <AssignDesignerModal
        job={assignOpen ? { ...job, id: workflowJobId } : null}
        onClose={onAssignClose}
        onSaved={onAssignSaved}
      />

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={o => { if (!o && !editSaving) onEditClose() }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
            <DialogDescription>
              Update the current revision&apos;s details and status.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <JobForm
              key={editOpen ? `edit-${job.id}` : "closed"}
              formId="detail-edit-form"
              job={job}
              onSubmit={onEditSubmit}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onEditClose} disabled={editSaving}>Cancel</Button>
            <Button type="submit" form="detail-edit-form" variant="primary" loading={editSaving} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={delOpen} onOpenChange={o => {
        if (!o && !deleting) onDeleteClose()
      }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel {isRevision ? "revision" : "job"}</DialogTitle>
            <DialogDescription>
              Cancel{" "}
              <span className="type-drawing-number text-ac">{job.drawingNumber}</span>?
              The {isRevision ? "revision" : "job"} moves to <strong>Archived Items</strong>. Its drawing number is kept on record and will not be reused.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="block text-xs font-medium text-t2 mb-2" htmlFor="jobs-cancel-reason">
              Reason for cancellation <span className="text-dn">*</span>
            </label>
            <Textarea
              id="jobs-cancel-reason"
              value={cancelReason}
              onChange={e => onCancelReasonChange(e.target.value)}
              placeholder="e.g. Client withdrew, duplicate entry…"
              rows={3}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onDeleteClose} disabled={deleting}>
              Keep job
            </Button>
            <Button
              variant="danger"
              onClick={onDelete}
              loading={deleting}
              disabled={deleting || cancelReason.trim().length < 3}
            >
              {deleting ? "Cancelling…" : "Cancel job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawing number edit dialog — admin only */}
      <Dialog open={dnEditOpen} onOpenChange={o => { if (!o && !dnEditSaving) onDnEditClose() }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Edit drawing number</DialogTitle>
            <DialogDescription>
              Current: <span className="type-drawing-number">{job.drawingNumber}</span>. The sequence counter will be updated automatically to prevent future duplicates.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input
              value={dnEditValue}
              onChange={e => onDnEditValueChange(e.target.value)}
              placeholder="e.g. 26/ORYX/06/001"
              className="type-drawing-number"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onDnEditClose} disabled={dnEditSaving}>Cancel</Button>
            <Button
              variant="primary"
              loading={dnEditSaving}
              disabled={dnEditSaving || !dnEditValue.trim() || dnEditValue.trim() === job.drawingNumber}
              onClick={() => void onDnEditSave()}
            >
              {dnEditSaving ? "Saving…" : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
