"use client"

import { useCallback, useState } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown } from "lucide-react"
import { SelectContent, SelectItem } from "@/components/ui/select"
import { DrawingStatusBadge } from "@/modules/jobs/components/drawing-status-badge"
import { JOB_STATUSES, getJobStatus } from "@/lib/constants"
import { useToast } from "@/shared/ui/toast"
import { cn } from "@/shared/utils"
import {
  COMPLETE_STATUS,
  statusChangeTitle,
} from "@/modules/jobs/lib/current-work"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"

export type WorkItemStatusSelectorProps = {
  workItemType: "original" | "revision"
  workItemId: string
  currentStatus: string
  revisionLabel?: string | null
  /** Override PATCH URL — work-items model uses /api/work-items/:id */
  patchUrl?: string
  size?: "md" | "lg"
  disabled?: boolean
  className?: string
  onStatusChanged?: (next: string) => void
  /** Optional optimistic UI hook before the request resolves */
  onOptimisticStatus?: (next: string) => void
  /** Called when the mutation fails after optimistic update */
  onStatusFailed?: (previous: string) => void
}

/**
 * Reusable status control built on the main-branch InlineStatusSelect pattern.
 * Patches the specific work item (original job or revision / work-item row).
 * Never silently updates a parent when editing a revision.
 */
export function WorkItemStatusSelector({
  workItemType,
  workItemId,
  currentStatus,
  revisionLabel = null,
  patchUrl,
  size = "md",
  disabled = false,
  className,
  onStatusChanged,
  onOptimisticStatus,
  onStatusFailed,
}: WorkItemStatusSelectorProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const title = statusChangeTitle(workItemType, revisionLabel)

  const applyStatus = useCallback(async (next: string) => {
    if (!next || next === currentStatus || busy || disabled) return
    const previous = currentStatus
    setBusy(true)
    onOptimisticStatus?.(next)
    try {
      const res = await fetch(patchUrl ?? `/api/jobs/${workItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast(body.error ?? "Failed to change status", "error")
        onStatusFailed?.(previous)
        return
      }
      toast(
        `Status → ${getJobStatus(next).label}`,
        "success",
      )
      onStatusChanged?.(next)
    } catch {
      toast("Network error", "error")
      onStatusFailed?.(previous)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }, [
    busy,
    currentStatus,
    disabled,
    onOptimisticStatus,
    onStatusChanged,
    onStatusFailed,
    patchUrl,
    toast,
    workItemId,
  ])

  const onValueChange = (next: string) => {
    if (currentStatus === COMPLETE_STATUS && next !== COMPLETE_STATUS) {
      setPending(next)
      return
    }
    void applyStatus(next)
  }

  const displayStatus = busy && pending ? pending : currentStatus

  return (
    <>
      <SelectPrimitive.Root
        value={displayStatus}
        onValueChange={onValueChange}
        disabled={disabled || busy}
      >
        <SelectPrimitive.Trigger
          onClick={e => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ac",
            size === "lg" && "hover:brightness-[0.97] active:scale-[0.98] transition-all",
            (disabled || busy) && "opacity-60 cursor-not-allowed",
            className,
          )}
          style={{ border: "none", background: "transparent", padding: 0, cursor: disabled || busy ? "not-allowed" : "pointer" }}
          aria-label={title}
          title={title}
        >
          <DrawingStatusBadge status={displayStatus} size={size} />
          <ChevronDown className="h-3.5 w-3.5 text-t4 opacity-70 group-hover:opacity-100 transition-opacity" />
        </SelectPrimitive.Trigger>
        <SelectContent align="start">
          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-t3 border-b border-bd mb-1">
            {title}
          </div>
          {JOB_STATUSES.map(s => (
            <SelectItem key={s.value} value={s.value}>
              <span className="inline-flex items-center gap-2">
                <DrawingStatusBadge status={s.value} />
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </SelectPrimitive.Root>

      <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open) setPending(null) }}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>
              {workItemType === "original"
                ? "Reopen original design?"
                : `Reopen ${revisionLabel ? revisionLabel : "revision"}?`}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-t2">
              This {workItemType === "original" ? "original design" : "revision"} has previously been
              marked complete and may already have been issued or invoiced. Historic records will be
              retained.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                const next = pending
                setPending(null)
                if (next) void applyStatus(next)
              }}
            >
              Reopen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
