"use client"
import dynamic from "next/dynamic"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import type { Job, JobFormData } from "@/lib/types"

// Lazy-load heavy dialog components — only downloaded when the user first
// opens a create/edit dialog, not on every initial page load.
const JobForm = dynamic(() => import("./job-form").then(m => m.JobForm), { ssr: false })

interface Props {
  // Create dialog
  createOpen: boolean
  createSaving: boolean
  onCreateClose: () => void
  onCreateSubmit: (form: JobFormData) => Promise<void>
  // Edit dialog
  editJob: Job | null
  editSaving: boolean
  onEditClose: () => void
  onEditSubmit: (form: JobFormData) => Promise<void>
  // Cancel/delete dialog
  deleteJob: Job | null
  deleting: boolean
  cancelReason: string
  onCancelReasonChange: (value: string) => void
  onDeleteClose: () => void
  onDeleteConfirm: () => Promise<void>
  // Shared
  designers: string[]
}

export function JobsDialogs({
  createOpen, createSaving, onCreateClose, onCreateSubmit,
  editJob, editSaving, onEditClose, onEditSubmit,
  deleteJob, deleting, cancelReason, onCancelReasonChange, onDeleteClose, onDeleteConfirm,
  designers,
}: Props) {
  return (
    <>
      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={() => { if (!createSaving) onCreateClose() }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New job</DialogTitle>
            <DialogDescription>
              Create a design, site visit, or CAT III check. Reference numbers are assigned automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <JobForm key={createOpen ? "open" : "closed"} formId="create-job-form" onSubmit={onCreateSubmit} designers={designers} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onCreateClose} disabled={createSaving}>Cancel</Button>
            <Button type="submit" form="create-job-form" variant="primary" loading={createSaving} disabled={createSaving}>
              {createSaving ? "Creating…" : "Create job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editJob} onOpenChange={o => { if (!o && !editSaving) onEditClose() }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit job</DialogTitle>
            <DialogDescription>Update job details and status.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {editJob && <JobForm key={editJob.id} formId="edit-job-form" job={editJob} onSubmit={onEditSubmit} designers={designers} />}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onEditClose} disabled={editSaving}>Cancel</Button>
            <Button type="submit" form="edit-job-form" variant="primary" loading={editSaving} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!deleteJob} onOpenChange={o => {
        if (!o && !deleting) onDeleteClose()
      }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Cancel job</DialogTitle>
            <DialogDescription>
              Cancel{" "}
              <span className="type-drawing-number text-ac">{deleteJob?.drawingNumber}</span>?
              The job moves to <strong>Archived Items</strong>. Its drawing number is kept on record and will not be reused. You can restore it later from Archive.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="block text-xs font-medium text-t2 mb-1.5">
              Reason for cancellation <span className="text-dn">*</span>
            </label>
            <Textarea
              value={cancelReason}
              onChange={e => onCancelReasonChange(e.target.value)}
              placeholder="e.g. Client withdrew, duplicate entry, project cancelled…"
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
              onClick={onDeleteConfirm}
              loading={deleting}
              disabled={deleting || cancelReason.trim().length < 3}
            >
              {deleting ? "Cancelling…" : "Cancel job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
