"use client"
import dynamic from "next/dynamic"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import type { Job, JobFormData } from "@/lib/types"
import { JobsCancelDialog } from "./jobs-cancel-dialog"

const JobForm = dynamic(() => import("./job-form").then(m => m.JobForm), { ssr: false })

interface Props {
  createOpen: boolean
  createSaving: boolean
  onCreateClose: () => void
  onCreateSubmit: (form: JobFormData) => Promise<void>
  editJob: Job | null
  editSaving: boolean
  onEditClose: () => void
  onEditSubmit: (form: JobFormData) => Promise<void>
  deleteJob: Job | null
  deleting: boolean
  cancelReason: string
  cancelNotes?: string
  onCancelReasonChange: (value: string) => void
  onCancelNotesChange?: (value: string) => void
  onDeleteClose: () => void
  onDeleteConfirm: () => Promise<void>
  designers: string[]
}

export function JobsDialogs({
  createOpen, createSaving, onCreateClose, onCreateSubmit,
  editJob, editSaving, onEditClose, onEditSubmit,
  deleteJob, deleting, cancelReason, cancelNotes = "",
  onCancelReasonChange, onCancelNotesChange, onDeleteClose, onDeleteConfirm,
  designers,
}: Props) {
  return (
    <>
      <Dialog open={createOpen} onOpenChange={(open) => {
        if (!open && !createSaving) {
          // Don't close the outer dialog if a nested dialog (quick-create client) is open
          if (document.querySelector('[data-nested="true"]')) return
          onCreateClose()
        }
      }}>
        <DialogContent
          size="lg"
          onInteractOutside={(e) => {
            if (document.querySelector('[data-nested="true"]')) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (document.querySelector('[data-nested="true"]')) e.preventDefault()
          }}
          onFocusOutside={(e) => {
            if (document.querySelector('[data-nested="true"]')) e.preventDefault()
          }}
        >
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

      <JobsCancelDialog
        job={deleteJob}
        open={!!deleteJob}
        deleting={deleting}
        cancelReason={cancelReason}
        cancelNotes={cancelNotes}
        onReasonChange={onCancelReasonChange}
        onNotesChange={onCancelNotesChange ?? (() => {})}
        onClose={onDeleteClose}
        onConfirm={onDeleteConfirm}
      />
    </>
  )
}
