"use client"
import { useState, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button }  from "@/components/ui/button"
import { Label }   from "@/components/ui/label"
import { useToast } from "@/components/ui/toast"
import { DesignerCombobox } from "@/components/designer-combobox"
import type { Job } from "@/lib/types"

interface Props {
  job:      Job | null          // null = closed
  onClose:  () => void
  onSaved:  (updated: Job) => void
}

export function AssignDesignerModal({ job, onClose, onSaved }: Props) {
  const { toast }    = useToast()
  const [name,    setName]    = useState("")
  const [saving,  setSaving]  = useState(false)

  // Reset each time a job is opened
  useEffect(() => {
    if (job) setName(job.designer || "")
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch when job changes
  }, [job?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!job || !name.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/assign`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ designer: name.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to assign designer", "error")
        return
      }
      const { job: updated } = await res.json() as { job: Job }
      toast(`Designer updated to ${name.trim()}`, "success")
      onSaved(updated)
      onClose()
    } catch {
      toast("Network error", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!job} onOpenChange={o => { if (!o && !saving) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Assign designer</DialogTitle>
          {job && (
            <DialogDescription>
              <span className="font-mono font-semibold text-ac">{job.drawingNumber}</span>
              {" — "}{job.address}
            </DialogDescription>
          )}
        </DialogHeader>

        <form id="assign-form" onSubmit={handleSubmit}>
          <div
            style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "6px" }}
          >
            <Label htmlFor="designer-input">Designer</Label>
            <DesignerCombobox
              value={name}
              onChange={setName}
              placeholder="Select a user…"
              autoFocus
            />
            <p className="text-[11px] text-t4 mt-1">
              Names come from active users. Prefer an exact Users-tab name so performance tracking matches.
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="assign-form"
            variant="primary"
            loading={saving}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
