"use client"

import { X } from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/shared/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogFooter,
  DialogTitle, DialogDescription, DialogBody,
} from "@/shared/ui/dialog"
import { JOB_DOCUMENT_CATEGORIES } from "../constants"
import type { JobDocumentRow } from "../types"

export function RenameDocumentDialog({
  doc,
  value,
  onValueChange,
  onClose,
  onConfirm,
}: {
  doc: JobDocumentRow | null
  value: string
  onValueChange: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={!!doc} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
          <DialogDescription>Update the display filename.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Label htmlFor="doc-rename">Filename</Label>
          <Input id="doc-rename" value={value} onChange={e => onValueChange(e.target.value)} className="mt-1.5" />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" onClick={onConfirm}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MoveCategoryDialog({
  doc,
  value,
  onValueChange,
  onClose,
  onConfirm,
}: {
  doc: JobDocumentRow | null
  value: string
  onValueChange: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={!!doc} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move category</DialogTitle>
          <DialogDescription>Choose a category for this document.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Select value={value} onValueChange={onValueChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {JOB_DOCUMENT_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" onClick={onConfirm}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteDocumentDialog({
  doc,
  onClose,
  onConfirm,
}: {
  doc: JobDocumentRow | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={!!doc} onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete document?</DialogTitle>
          <DialogDescription>
            {doc?.filename} will be removed from this job. This cannot be undone from the UI.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
