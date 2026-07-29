"use client"
import dynamic from "next/dynamic"
import { Archive } from "lucide-react"
import { Button } from "@/shared/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogBody,
} from "@/shared/ui/dialog"
import { EMPTY_FORM, type QuoteFormData } from "./quote-form"
import type { Quote } from "@/lib/types"

const QuoteForm = dynamic(() => import("./quote-form").then(m => m.QuoteForm), { ssr: false })
const CreateJobFromQuoteModal = dynamic(
  () => import("./create-job-from-quote-modal").then(m => m.CreateJobFromQuoteModal),
  { ssr: false },
)

export interface QuotesDialogsProps {
  // Create
  createOpen: boolean
  onCreateClose: () => void
  saving: boolean
  onCreateSubmit: (form: QuoteFormData) => Promise<void>
  createInitialOverrides?: Partial<QuoteFormData>
  // Edit
  editQuote: Quote | null
  onEditClose: () => void
  editInitial: QuoteFormData | null
  onEditSubmit: (form: QuoteFormData) => Promise<void>
  // Convert
  convertQuote: Quote | null
  onConvertClose: () => void
  onConverted: () => void
  // Archive single
  archiveQuote: Quote | null
  archiving: boolean
  onArchiveClose: () => void
  onArchiveConfirm: () => void
  // Clear expired
  clearConfirmOpen: boolean
  clearing: boolean
  expiredClearableCount: number
  onClearClose: () => void
  onClearConfirm: () => void
}

export function QuotesDialogs({
  createOpen, onCreateClose, saving, onCreateSubmit, createInitialOverrides,
  editQuote, onEditClose, editInitial, onEditSubmit,
  convertQuote, onConvertClose, onConverted,
  archiveQuote, archiving, onArchiveClose, onArchiveConfirm,
  clearConfirmOpen, clearing, expiredClearableCount, onClearClose, onClearConfirm,
}: QuotesDialogsProps) {
  return (
    <>
      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={o => { if (!o) onCreateClose() }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New quote</DialogTitle></DialogHeader>
          <DialogBody>
            <QuoteForm formId="create-quote-form" initial={{ ...EMPTY_FORM, ...createInitialOverrides }} onSubmit={onCreateSubmit} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onCreateClose} disabled={saving}>Cancel</Button>
            <Button type="submit" form="create-quote-form" variant="primary" loading={saving}>Create quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editQuote} onOpenChange={o => { if (!o) onEditClose() }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>Edit {editQuote?.quoteNumber}</DialogTitle></DialogHeader>
          <DialogBody>
            {editQuote && editInitial && (
              <QuoteForm formId="edit-quote-form" initial={editInitial} quoteId={editQuote.id} onSubmit={onEditSubmit} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onEditClose} disabled={saving}>Cancel</Button>
            <Button type="submit" form="edit-quote-form" variant="primary" loading={saving}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create job from quote */}
      {convertQuote && (
        <CreateJobFromQuoteModal
          quote={convertQuote}
          onClose={onConvertClose}
          onConverted={onConverted}
        />
      )}

      {/* Archive single quote */}
      <Dialog open={!!archiveQuote} onOpenChange={o => { if (!o && !archiving) onArchiveClose() }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Archive quote?</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              <span className="font-semibold text-t1">{archiveQuote?.quoteNumber}</span>
              {" "}will be moved to the archive and hidden from the quotes list.
            </p>
            <p className="text-xs text-t3 mt-2">
              You can restore it from the{" "}
              <span className="font-medium text-t2">Archived Items</span>{" "}page.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onArchiveClose} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onArchiveConfirm} loading={archiving} className="bg-wn hover:bg-wn/90">
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear all expired */}
      <Dialog open={clearConfirmOpen} onOpenChange={o => { if (!o && !clearing) onClearClose() }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Archive expired quotes?</DialogTitle></DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              <span className="font-semibold text-t1">{expiredClearableCount}</span>
              {" "}expired quote{expiredClearableCount !== 1 ? "s" : ""} that{" "}
              {expiredClearableCount === 1 ? "was" : "were"} never converted to a job will be archived.
            </p>
            <p className="text-xs text-t3 mt-2">
              They can be restored from the{" "}
              <span className="font-medium text-t2">Archived Items</span>{" "}page.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClearClose} disabled={clearing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onClearConfirm} loading={clearing} className="bg-wn hover:bg-wn/90">
              <Archive className="h-3.5 w-3.5" /> Archive expired
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
